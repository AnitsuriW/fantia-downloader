// fantia-auto-downloader.js
import puppeteer from "puppeteer";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import cliProgress from "cli-progress";
import prettyBytes from "pretty-bytes";
import readline from "readline";

const BASE_DIR = "Fantia_Downloads";
const COOKIE_FILE = "cookie.json";
const DIRECTION = "forward"; // 可设置为 "forward", "backward", 或 "once"

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  let cookies = null;

  // Load cookie if exists
  if (await fs.pathExists(COOKIE_FILE)) {
    cookies = await fs.readJSON(COOKIE_FILE);
    await page.setCookie(...cookies);
    console.log("🍪 已加载 cookie.json，尝试免登录");
  }

  await page.goto("https://fantia.jp/", { waitUntil: "networkidle2" });
  if (!cookies) {
    console.log("🔐 请手动登录 Fantia，然后按 Enter 继续...");
    await new Promise((r) => process.stdin.once("data", r));
    const newCookies = await page.cookies();
    await fs.writeJSON(COOKIE_FILE, newCookies, { spaces: 2 });
    console.log("✅ 已保存 cookie.json，可供下次免登录使用");
  }

  const ask = (q) => new Promise((res) => rl.question(q, res));
  const input = await ask("请输入起始 Post ID：");
  rl.close();
  let currentPostURL = `https://fantia.jp/posts/${input.trim()}`;
  let visited = new Set();

  while (currentPostURL) {
    const match = currentPostURL.match(/posts\/(\d+)/);
    const POST_ID = match?.[1];
    if (!POST_ID || visited.has(POST_ID)) break;
    visited.add(POST_ID);

    console.log("\n📥 正在处理 post:", POST_ID);

    let postData = null;
    page.removeAllListeners("response");
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes(`/api/v1/posts/${POST_ID}`)) {
        try {
          const json = await response.json();
          if (json?.post?.post_contents) postData = json;
        } catch {}
      }
    });

    await page.goto(`https://fantia.jp/posts/${POST_ID}`, { waitUntil: "networkidle2" });
    await delay(3000);
    if (!postData) {
      console.warn("⚠️ 跳过无法解析的 post:", POST_ID);
      break;
    }

    const titleSafe = postData.post.title.replace(/[\\/:*?"<>|]/g, "_");
    const saveDir = path.join(BASE_DIR, `${POST_ID}_${titleSafe}`);
    await fs.ensureDir(saveDir);
    await fs.writeJSON(path.join(saveDir, "post.json"), postData, { spaces: 2 });

    const sessionCookies = await page.cookies();
    const sessionHeader = sessionCookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const contents = postData.post.post_contents || [];
    const resources = contents.flatMap((content) => {
      const videos = content.download_uri
        ? [
            {
              url: `https://fantia.jp${content.download_uri}`,
              filename: content.filename || `video-${content.id}.mp4`,
            },
          ]
        : [];
      const images = (content.post_content_photos || []).map((photo) => ({
        url: photo.url.original,
        filename: `image-${photo.id}.jpg`,
      }));
      return [...videos, ...images];
    });

    for (const res of resources) {
      const filePath = path.join(saveDir, res.filename);
      if (await fs.pathExists(filePath)) {
        console.log(`⏩ 跳过已存在文件: ${res.filename}`);
        continue;
      }

      try {
        const { headers } = await axios.head(res.url, {
          headers: {
            Cookie: sessionHeader,
            Referer: `https://fantia.jp/posts/${POST_ID}`,
            "User-Agent": "Mozilla/5.0",
          },
        });

        const totalSize = parseInt(headers["content-length"], 10);
        const bar = new cliProgress.SingleBar({
          format: `${res.filename} [{bar}] {percentage}% {value}/{total}`,
          barCompleteChar: "█",
          barIncompleteChar: "-",
          hideCursor: true,
        }, cliProgress.Presets.shades_classic);

        bar.start(totalSize, 0, {
          value: "0",
          total: prettyBytes(totalSize),
        });

        const response = await axios.get(res.url, {
          responseType: "stream",
          headers: {
            Cookie: sessionHeader,
            Referer: `https://fantia.jp/posts/${POST_ID}`,
            "User-Agent": "Mozilla/5.0",
          },
        });

        let downloaded = 0;
        response.data.on("data", (chunk) => {
          downloaded += chunk.length;
          bar.update(downloaded, {
            value: prettyBytes(downloaded),
            total: prettyBytes(totalSize),
          });
        });

        await new Promise((res, rej) => {
          const writer = fs.createWriteStream(filePath);
          response.data.pipe(writer);
          writer.on("finish", res);
          writer.on("error", rej);
        });

        bar.stop();
        console.log(`✅ 下载完成: ${res.filename}`);
      } catch (e) {
        console.warn(`❌ 下载失败: ${res.filename} - ${e.message}`);
      }
    }

    if (DIRECTION === "once") break;

    const nextLink = await page.evaluate((dir) => {
      if (dir === "forward") {
        const next = document.querySelector("a.post-next");
        return next?.href || null;
      } else if (dir === "backward") {
        const prev = document.querySelector("a.post-prev");
        return prev?.href || null;
      }
      return null;
    }, DIRECTION);

    if (!nextLink) {
      console.log("✅ 没有更多可跳转的 post，任务完成。");
      break;
    }

    currentPostURL = nextLink;
    await delay(1500);
  }

  console.log("🎉 所有可下载内容处理完成。");
  await browser.close();
})();

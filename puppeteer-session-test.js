// puppeteer-fantia-downloader.js
import puppeteer from "puppeteer";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import cliProgress from "cli-progress";
import prettyBytes from "pretty-bytes";

const POST_ID = "3464281"; // 替换成你要下载的 post ID
const DOWNLOAD_DIR = `Fantia_${POST_ID}`;

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();

  let postData = null;
  let sessionCookies = [];

  // 拦截 API 响应
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes(`/api/v1/posts/${POST_ID}`)) {
      try {
        const json = await response.json();
        if (json?.post?.post_contents) {
          postData = json;
          console.log("✅ 已获取 Post 标题：", json.post.title);
        }
      } catch (err) {
        console.error("❌ JSON 解析失败：", err.message);
      }
    }
  });

  // 1️⃣ 登录 Fantia
  await page.goto("https://fantia.jp/", { waitUntil: "networkidle2" });
  console.log("🔐 请手动登录 Fantia，并按 Enter 继续");
  await new Promise(resolve => process.stdin.once("data", resolve));

  // 2️⃣ 获取登录后 Cookie
  sessionCookies = await page.cookies();
  const sessionHeader = sessionCookies.map(c => `${c.name}=${c.value}`).join("; ");

  // 3️⃣ 打开目标 Post 页面
  await page.goto(`https://fantia.jp/posts/${POST_ID}`, { waitUntil: "networkidle2" });
  await new Promise(resolve => setTimeout(resolve, 3000));
  await browser.close();

  // 4️⃣ 下载资源
  if (!postData) {
    console.error("❌ 未能获取 Post 数据，退出");
    return;
  }

  const contents = postData.post.post_contents || [];
  const titleSafe = postData.post.title.replace(/[\\/:*?"<>|]/g, "_");
  const saveDir = path.join(DOWNLOAD_DIR, `${POST_ID}_${titleSafe}`);
  await fs.ensureDir(saveDir);

  const resources = contents.flatMap(content => {
    const videos = content.download_uri
      ? [{
          url: `https://fantia.jp${content.download_uri}`,
          filename: content.filename || `video-${content.id}.mp4`
        }]
      : [];

    const images = (content.post_content_photos || []).map(photo => ({
      url: photo.url.original,
      filename: `image-${photo.id}.jpg`
    }));

    return [...videos, ...images];
  });

  console.log(`📥 共准备下载 ${resources.length} 项资源`);

  for (const res of resources) {
    const filePath = path.join(saveDir, res.filename);
    if (await fs.pathExists(filePath)) {
      console.log(`⏩ 已存在，跳过：${res.filename}`);
      continue;
    }

    try {
      const { headers } = await axios.head(res.url, {
        headers: {
          Cookie: sessionHeader,
          Referer: `https://fantia.jp/posts/${POST_ID}`,
          "User-Agent": "Mozilla/5.0"
        }
      });

      const totalSize = parseInt(headers["content-length"], 10);
      const progressBar = new cliProgress.SingleBar({
        format: `${res.filename} [{bar}] {percentage}% {value}/{total}`,
        barCompleteChar: "█",
        barIncompleteChar: "-",
        hideCursor: true
      }, cliProgress.Presets.shades_classic);

      progressBar.start(totalSize, 0, {
        value: "0",
        total: prettyBytes(totalSize)
      });

      const response = await axios.get(res.url, {
        responseType: "stream",
        headers: {
          Cookie: sessionHeader,
          Referer: `https://fantia.jp/posts/${POST_ID}`,
          "User-Agent": "Mozilla/5.0"
        }
      });

      let downloaded = 0;

      response.data.on("data", chunk => {
        downloaded += chunk.length;
        progressBar.update(downloaded, {
          value: prettyBytes(downloaded),
          total: prettyBytes(totalSize)
        });
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      progressBar.stop();
      console.log(`✅ 下载完成：${res.filename}`);

    } catch (err) {
      console.error(`❌ 下载失败：${res.filename} - ${err.message}`);
    }
  }

  console.log(`🎉 所有资源已保存至：${saveDir}`);
})();

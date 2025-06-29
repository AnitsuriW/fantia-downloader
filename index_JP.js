import puppeteer from "puppeteer";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import cliProgress from "cli-progress";
import prettyBytes from "pretty-bytes";
import readline from "readline";
import dotenv from "dotenv";
import { execSync } from "child_process";

process.on("exit", () => process.exit(0));
dotenv.config();

const BASE_DIR = process.env.DOWNLOAD_PATH || "Fantia_Downloads";
const COOKIE_FILE = "cookie.json";
const DIRECTION = process.env.DIRECTION || "once";
const USE_IDM = process.env.USE_IDM === "true";
const IDM_PATH = process.env.IDM_PATH || 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe';
const BLOCK_KEYWORDS = (process.env.BLOCK_KEYWORDS || "").split(",").map(k => k.trim()).filter(Boolean);
const BLOCK_FILENAME_KEYWORDS = (process.env.BLOCK_FILENAME_KEYWORDS || "").split(",").map(k => k.trim()).filter(Boolean);

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  let cookies = null;

  if (await fs.pathExists(COOKIE_FILE)) {
    cookies = await fs.readJSON(COOKIE_FILE);
    await page.setCookie(...cookies);
    console.log("✅ cookie.json を読み込み、自動ログインを試行中...");
  }

  await page.goto("https://fantia.jp/", { waitUntil: "networkidle2" });
  if (!cookies) {
    console.log("🔐 Fantia に手動でログインしてください。その後 Enter を押してください...");
    await new Promise((r) => process.stdin.once("data", r));
    const newCookies = await page.cookies();
    await fs.writeJSON(COOKIE_FILE, newCookies, { spaces: 2 });
    console.log("✅ ログイン成功。cookie.json を保存しました。");
  }

  const ask = (q) => new Promise((res) => rl.question(q, res));
  const input = await ask("📥 開始する 投稿ID を入力してください：");
  rl.close();
  let currentPostURL = `https://fantia.jp/posts/${input.trim()}`;
  let visited = new Set();

  while (currentPostURL) {
    const match = currentPostURL.match(/posts\/(\d+)/);
    const POST_ID = match?.[1];
    if (!POST_ID || visited.has(POST_ID)) break;
    visited.add(POST_ID);

    console.log(`\n📂 投稿 ${POST_ID} を処理中...`);

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
      console.warn("⚠️ 投稿情報の取得に失敗したためスキップします:", POST_ID);
    } else {
      const title = postData.post.title || "";
      const titleSafe = title.replace(/[\\/:*?"<>|]/g, "_");

      if (BLOCK_KEYWORDS.some(keyword => title.includes(keyword))) {
        console.log(`🚫 投稿タイトルにフィルターワードが含まれているためスキップ: ${title}`);
      } else {
        const saveDir = path.join(BASE_DIR, `${POST_ID}_${titleSafe}`);
        await fs.ensureDir(saveDir);
        await fs.writeJSON(path.join(saveDir, "post.json"), postData, { spaces: 2 });

        const sessionCookies = await page.cookies();
        const sessionHeader = sessionCookies.map((c) => `${c.name}=${c.value}`).join("; ");

        const contents = postData.post.post_contents || [];
        const resources = contents.flatMap((content) => {
          const videos = content.download_uri
            ? [{
                url: `https://fantia.jp${content.download_uri}`,
                filename: content.filename || `video-${content.id}.mp4`,
              }]
            : [];
          const images = (content.post_content_photos || []).map((photo) => ({
            url: photo.url.original,
            filename: `image-${photo.id}.jpg`,
          }));
          return [...videos, ...images];
        });

        for (const res of resources) {
          if (BLOCK_FILENAME_KEYWORDS.some(k => res.filename.includes(k))) {
            console.log(`🚫 ファイル名にフィルターワードが含まれているためスキップ: ${res.filename}`);
            continue;
          }

          const filePath = path.join(saveDir, res.filename);
          if (await fs.pathExists(filePath)) {
            console.log(`⏩ 既に存在するファイルをスキップ: ${res.filename}`);
            continue;
          }

          if (USE_IDM) {
            try {
              const cmdAdd = `"${IDM_PATH}" /d "${res.url}" /p "${saveDir}" /f "${res.filename}" /n /a`;
              const cmdStart = `"${IDM_PATH}" /s`;
              execSync(cmdAdd);
              execSync(cmdStart);
              console.log(`📥 IDM に追加してダウンロード開始: ${res.filename}`);
            } catch (e) {
              console.warn(`❌ IDM でのダウンロード失敗: ${res.filename} - ${e.message}`);
            }
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
            console.log(`✅ ダウンロード完了: ${res.filename}`);
          } catch (e) {
            console.warn(`❌ ダウンロード失敗: ${res.filename} - ${e.message}`);
          }
        }
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
      console.log("✅ これ以上遷移できる投稿はありません。処理を終了します。");
      break;
    }

    currentPostURL = nextLink;
    await delay(1500);
  }

  console.log("🎉 すべてのダウンロードが完了しました！");
  await browser.close();
  process.exit(0);
})();
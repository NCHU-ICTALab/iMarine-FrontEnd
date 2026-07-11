#!/usr/bin/env node
/* demo 影片 recorder：獨立 dev server(:5288) + headed Chromium + 合成游標
   + Playwright 錄影 → ffmpeg 轉 mp4 + payoff 停格 png。
   用法：npm run demo:record -- <scenario> [--take N]
   規約：不動使用者 .env；pageerror 一律視為錄製失敗。 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildConvertArgs, buildStillArgs } from './ffmpeg.mjs';
import { cursorInitScript, createCursor } from './cursor.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5288;
const OUT = join(ROOT, 'demo-videos');
const DSF = 2; // DSF=2 定案：probe-dsf1 vs probe（DSF2）中段抽幀比對，1920x1080 下右下角
                // hint bar（1-6 功能頁 · 0 總覽 · Enter 封面切換）與 chips 文字，DSF2 supersample
                // 後的筆畫邊緣明顯較平滑、DSF1 略有鋸齒/顆粒感，故取 supersample 較銳利者

const name = process.argv[2];
const takeIdx = process.argv.indexOf('--take');
const take = takeIdx > -1 ? Number(process.argv[takeIdx + 1]) : 0;
if (!name) { console.error('用法: npm run demo:record -- <scenario> [--take N]'); process.exit(1); }

const scenario = (await import(`./scenarios/${name}.mjs`)).default;
if (scenario.prereq) console.log(`[前置] ${scenario.prereq}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exit ${c}`))));
});

async function waitOn(url, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await sleep(300);
  }
  throw new Error(`dev server 未就緒: ${url}`);
}

mkdirSync(join(OUT, '.raw'), { recursive: true });
mkdirSync(join(OUT, 'stills'), { recursive: true });

// 直接 spawn vite 執行檔（不經 npx：SIGTERM 才殺得到真正的 dev server，不留孤兒進程）；
// stdout 丟棄避免 pipe 背壓塞住 vite，stderr 透傳供除錯。
const server = spawn('node', [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, ...(scenario.env ?? {}) },
});
let browser;
let exitCode = 0;
try {
  await waitOn(`http://localhost:${PORT}/`, 30000);

  browser = await chromium.launch({
    headless: false,
    args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: DSF,
    recordVideo: { dir: join(OUT, '.raw'), size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  await page.addInitScript(cursorInitScript());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const t0 = Date.now();
  const marks = {};
  const ctx = {
    page,
    baseURL: `http://localhost:${PORT}`,
    sleep,
    mark: (n) => { marks[n] = (Date.now() - t0) / 1000; },
    log: (m) => console.log(`  · ${m}`),
    cursor: createCursor(page),
    async go(id) {
      await page.goto(`http://localhost:${PORT}/#/${id}`);
      await page.waitForSelector(`#s-${id}.active`, { timeout: 15000 });
      await page.bringToFront();
    },
  };

  console.log(`[錄製] ${name}（目標 ~${scenario.targetSec}s）`);
  await scenario.run(ctx);

  const video = page.video();
  await context.close(); // flush webm
  const raw = await video.path();

  const suffix = take ? `.take${take}` : '';
  const outMp4 = join(OUT, `${name}${suffix}.mp4`);
  const post = scenario.post ?? {};
  const trimStartSec = post.trimAtMark ? Math.max(0, (marks[post.trimAtMark] ?? 0) - 0.3) : 0;
  const ramps = (post.ramps ?? [])
    .map((r) => ({ from: marks[r.from], to: marks[r.to], factor: r.factor }))
    .filter((r) => r.from != null && r.to != null && r.to > r.from);
  await run('ffmpeg', buildConvertArgs({ input: raw, output: outMp4, trimStartSec, ramps }));
  await run('ffmpeg', buildStillArgs(outMp4, join(OUT, 'stills', `${name}.png`)));
  rmSync(raw, { force: true }); // raw webm 可再生成，不留殘檔

  if (errors.length) {
    console.error(`[失敗] 頁面有 ${errors.length} 個 uncaught exception，影片作廢：`);
    errors.forEach((e) => console.error('  ' + e));
    exitCode = 1; // 先記錄失敗、待 finally 收尾（關瀏覽器+殺 dev server）跑完再真的 exit，
                  // 避免 process.exit() 在 try 內同步觸發、跳過下面的 finally 留下孤兒 dev server
  } else {
    console.log(`[完成] ${outMp4}`);
    console.log(`[停格] demo-videos/stills/${name}.png`);
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
if (exitCode) process.exit(exitCode);

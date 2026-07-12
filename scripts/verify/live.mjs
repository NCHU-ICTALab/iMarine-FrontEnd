#!/usr/bin/env node
/* live 驗收 runner：npm run verify:live -- <module>
   起隔離 dev server(:5320 strictPort) → headless Chromium → #/<module> → 跑 live/<module>.mjs 斷言
   → 截圖 → SIGTERM 收尾。不動使用者既有 port（5173/5174/5288/8000/8100/8545）。
   環境變數繼承使用者 .env（live 驗收本來就要真後端位址）。 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { formatResults, summarize } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 5320;
const MODULES = ['policy', 'dispatch', 'epidemic', 'alert'];

const mod = process.argv[2];
if (!mod || !MODULES.includes(mod)) {
  console.error(`用法：npm run verify:live -- <${MODULES.join('|')}>`);
  process.exit(2);
}

const def = (await import(`./live/${mod}.mjs`)).default;
if (def.pending) {
  console.error(`[${mod}] 契約待定：${def.reason}`);
  console.error(`後端契約定案的第一個 live PR 需填實 scripts/verify/live/${mod}.mjs 與 docs/collab/${mod}.md §6`);
  process.exit(2);
}

async function waitOn(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* dev server 還沒起來，繼續等 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev server ${url} 於 ${ms}ms 內未就緒`);
}

// stdout 丟棄避免 pipe 背壓塞住 vite，stderr 透傳供除錯（比照 recorder.mjs）
const server = spawn(
  'node',
  [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
);

let exitCode = 1;
let browser;
try {
  await waitOn(`http://localhost:${PORT}/`, 30000);
  // WebGL 頁（epidemic 的 Mapbox GL）headless 走 SwiftShader 軟體渲染；勿加 --disable-gpu
  browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1620, height: 1080 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`http://localhost:${PORT}/#/${mod}`);
  await page.waitForSelector(`#s-${mod}.active`, { timeout: 15000 });

  const results = await def.asserts(page);
  results.push({
    name: '全程零 pageerror',
    ok: pageErrors.length === 0,
    detail: pageErrors.length ? pageErrors.join(' | ') : undefined,
  });

  const shot = join(tmpdir(), `imarine-verify-live-${mod}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  console.log(formatResults(results));
  const s = summarize(results);
  console.log(`${s.passed} PASS / ${s.failed} FAIL · 截圖 ${shot}`);
  exitCode = s.exitCode;
} catch (e) {
  console.error(`[${mod}] live 驗收中斷：${e?.message ?? e}`);
  exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
process.exit(exitCode);

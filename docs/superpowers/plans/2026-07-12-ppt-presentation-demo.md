# 競賽簡報腳本 + Demo 影片自動化錄製 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 產出決賽簡報腳本文件（`docs/presentation/簡報腳本.md`）與 9 支系統展示影片（`demo-videos/*.mp4`），影片由 Playwright 錄製腳本自動產出、可一鍵重錄。

**Architecture:** `scripts/demo/` 三個共用模組（ffmpeg 參數建構純函式 / 合成游標 / recorder runner）+ 每支影片一個 scenario 檔。recorder 起獨立 dev server（:5288）→ headed Chromium（真 GPU）→ 注入合成游標 → 執行 scenario → webm 經 ffmpeg 轉 mp4 + 輸出 payoff 停格 png。scenario 以 `mark()` 標記時間點，後製（修剪頭部、速度 ramp）由 marks 驅動。

**Tech Stack:** Playwright（devDependency，headed Chromium）、ffmpeg 8.1.2（`/opt/homebrew/bin/ffmpeg`，已裝）、Node ESM `.mjs`（`package.json` 已是 `"type":"module"`）、vitest（純函式 TDD）。

**Spec:** `docs/superpowers/specs/2026-07-12-ppt-presentation-demo-design.md`（分鏡、時間軸、驗收標準以 spec 為準）。

## Global Constraints

- 依 CLAUDE.md：禁止 emoji；commit 訊息無任何 Claude/Anthropic 署名；不做順手清理；對話與文件繁中+英術語。
- **不動 `src/`**（錄影腳本全在 `scripts/demo/`；`tsc --noEmit`、`vitest run` 既有基線、`npm run build` 三綠燈不得受影響）。
- **不動使用者的 `.env`、不佔用 :5173/:5174/:8000/:8100/:8545**；錄製 dev server 固定用 **:5288**。
- 影片不進版控：`.gitignore` 加 `demo-videos/`；錄影腳本與簡報腳本文件進版控。
- 影片規格：mp4 / H.264 / 1920×1080 / 30fps / 無音軌 / `yuv420p` / `+faststart`。
- 合成游標節奏（spec §6）：移動 600-900ms easing、懸停 300-500ms 再點擊、點擊漣漪 ~400ms。
- 每支模組影片目標 28-36s、`hero-cover`/`hero-overview` 各 ~10-14s、`agent-finale` 後製後 ~70-90s（目檢驗收一律以此區間為準）。
- scenario 內任何 `pageerror`（uncaught exception）→ recorder 以非零碼結束、該次影片作廢。
- 9 支 scenario 名單（= 影片檔名）：`hero-cover` `hero-overview` `carbon` `policy` `twin` `dispatch` `epidemic` `alert` `agent-finale`。

---

### Task 1: ffmpeg 參數建構純函式（TDD）+ 依賴就緒

**Files:**
- Create: `scripts/demo/ffmpeg.mjs`
- Create: `scripts/demo/ffmpeg.d.mts`（tsconfig include 含 `tests/`，`.ts` 測試 import `.mjs` 需宣告檔）
- Create: `tests/demo-ffmpeg.test.ts`
- Modify: `.gitignore`（加 `demo-videos/`）
- Modify: `package.json`（devDependency `playwright` + script `demo:record`）

**Interfaces:**
- Consumes: 無（起點 task）。
- Produces:
  - `buildConvertArgs({input, output, trimStartSec = 0, ramps = []}): string[]`——webm→mp4 的完整 ffmpeg 參數。`ramps: {from:number, to:number, factor:number}[]`（秒，絕對時間、遞增不重疊）。
  - `buildStillArgs(input: string, output: string): string[]`——取影片倒數 0.3s 一幀存 png。
  - Task 2 的 recorder 直接 import 這兩個函式。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/demo-ffmpeg.test.ts
import { describe, it, expect } from 'vitest';
import { buildConvertArgs, buildStillArgs } from '../scripts/demo/ffmpeg.mjs';

const VF = 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p';

describe('buildConvertArgs', () => {
  it('無修剪無 ramp：單純 -vf 轉檔', () => {
    expect(buildConvertArgs({ input: 'a.webm', output: 'a.mp4' })).toEqual([
      '-y', '-i', 'a.webm',
      '-vf', VF,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-an', '-movflags', '+faststart', 'a.mp4',
    ]);
  });

  it('只修剪頭部：-ss 放在 -i 之前', () => {
    expect(buildConvertArgs({ input: 'a.webm', output: 'a.mp4', trimStartSec: 1.3 })).toEqual([
      '-y', '-ss', '1.30', '-i', 'a.webm',
      '-vf', VF,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-an', '-movflags', '+faststart', 'a.mp4',
    ]);
  });

  it('一段 ramp：filter_complex 三段 trim/setpts/concat', () => {
    const args = buildConvertArgs({
      input: 'a.webm', output: 'a.mp4', trimStartSec: 1,
      ramps: [{ from: 5, to: 9, factor: 2 }],
    });
    expect(args).toEqual([
      '-y', '-i', 'a.webm',
      '-filter_complex',
      '[0:v]trim=start=1.00:end=5.00,setpts=PTS-STARTPTS[s0];' +
      '[0:v]trim=start=5.00:end=9.00,setpts=(PTS-STARTPTS)/2[s1];' +
      '[0:v]trim=start=9.00,setpts=PTS-STARTPTS[s2];' +
      `[s0][s1][s2]concat=n=3:v=1,${VF}[v]`,
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-an', '-movflags', '+faststart', 'a.mp4',
    ]);
  });

  it('兩段 ramp：五段 concat', () => {
    const args = buildConvertArgs({
      input: 'a.webm', output: 'a.mp4',
      ramps: [{ from: 2, to: 4, factor: 1.5 }, { from: 8, to: 12, factor: 2 }],
    });
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(fc).toBe(
      '[0:v]trim=start=0.00:end=2.00,setpts=PTS-STARTPTS[s0];' +
      '[0:v]trim=start=2.00:end=4.00,setpts=(PTS-STARTPTS)/1.5[s1];' +
      '[0:v]trim=start=4.00:end=8.00,setpts=PTS-STARTPTS[s2];' +
      '[0:v]trim=start=8.00:end=12.00,setpts=(PTS-STARTPTS)/2[s3];' +
      '[0:v]trim=start=12.00,setpts=PTS-STARTPTS[s4];' +
      `[s0][s1][s2][s3][s4]concat=n=5:v=1,${VF}[v]`,
    );
  });
});

describe('buildStillArgs', () => {
  it('取倒數 0.3s 一幀', () => {
    expect(buildStillArgs('a.mp4', 's.png')).toEqual([
      '-y', '-sseof', '-0.3', '-i', 'a.mp4', '-frames:v', '1', '-update', '1', 's.png',
    ]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/demo-ffmpeg.test.ts`
Expected: FAIL（`Cannot find module '../scripts/demo/ffmpeg.mjs'`）

- [ ] **Step 3: 實作 `scripts/demo/ffmpeg.mjs`**

```js
/* ffmpeg 參數建構（純函式，vitest 覆蓋）。
   speed ramp 用 trim+setpts+concat 三明治；時間一律絕對秒、toFixed(2)。 */

const VF = 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p';
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an', '-movflags', '+faststart'];
const f2 = (n) => n.toFixed(2);

export function buildConvertArgs({ input, output, trimStartSec = 0, ramps = [] }) {
  if (!ramps.length) {
    const head = trimStartSec > 0 ? ['-y', '-ss', f2(trimStartSec), '-i', input] : ['-y', '-i', input];
    return [...head, '-vf', VF, ...ENC, output];
  }
  // 邊界序列：trimStart, (from,to)*, 末段開放
  const segs = [];
  let cursor = trimStartSec;
  for (const r of ramps) {
    segs.push({ start: cursor, end: r.from, factor: 1 });
    segs.push({ start: r.from, end: r.to, factor: r.factor });
    cursor = r.to;
  }
  segs.push({ start: cursor, end: null, factor: 1 });
  const parts = segs.map((s, i) => {
    const range = s.end == null ? `trim=start=${f2(s.start)}` : `trim=start=${f2(s.start)}:end=${f2(s.end)}`;
    const pts = s.factor === 1 ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${s.factor}`;
    return `[0:v]${range},${pts}[s${i}]`;
  });
  const labels = segs.map((_, i) => `[s${i}]`).join('');
  const fc = `${parts.join(';')};${labels}concat=n=${segs.length}:v=1,${VF}[v]`;
  return ['-y', '-i', input, '-filter_complex', fc, '-map', '[v]', ...ENC, output];
}

export function buildStillArgs(input, output) {
  return ['-y', '-sseof', '-0.3', '-i', input, '-frames:v', '1', '-update', '1', output];
}
```

- [ ] **Step 4: 寫宣告檔 `scripts/demo/ffmpeg.d.mts`**

```ts
export interface Ramp { from: number; to: number; factor: number }
export function buildConvertArgs(opts: {
  input: string; output: string; trimStartSec?: number; ramps?: Ramp[];
}): string[];
export function buildStillArgs(input: string, output: string): string[];
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run tests/demo-ffmpeg.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 6: 依賴與設定**

```bash
npm i -D playwright
npx playwright install chromium
```

`.gitignore` 檔尾加一行：

```
demo-videos/
```

`package.json` 的 `scripts` 加（`dev` 之後）：

```json
"demo:record": "node scripts/demo/recorder.mjs"
```

- [ ] **Step 7: 三綠燈迴歸**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 0 errors；vitest 全綠（既有 26 檔 123 tests + 本檔 5 tests）；build 成功。

- [ ] **Step 8: Commit**

```bash
git add scripts/demo/ffmpeg.mjs scripts/demo/ffmpeg.d.mts tests/demo-ffmpeg.test.ts .gitignore package.json package-lock.json
git commit -m "feat(demo): ffmpeg 參數建構純函式 + playwright devDep + demo-videos gitignore"
```

---

### Task 2: 合成游標 + recorder runner + probe 畫質定案

**Files:**
- Create: `scripts/demo/cursor.mjs`
- Create: `scripts/demo/recorder.mjs`
- Create: `scripts/demo/scenarios/probe.mjs`

**Interfaces:**
- Consumes: Task 1 的 `buildConvertArgs` / `buildStillArgs`。
- Produces（所有 scenario 依賴的 ctx API 與 scenario 契約，之後 task 不得更名）:
  - scenario 檔契約：`export default { name: string, targetSec: number, prereq?: string, env?: Record<string,string>, post?: { trimAtMark?: string, ramps?: {from:string, to:string, factor:number}[] }, run(ctx): Promise<void> }`
  - `ctx = { page, baseURL, go(id), sleep(ms), mark(name), log(msg), cursor }`
    - `go(id)`：`page.goto(baseURL + '/#/' + id)` 後等 `#s-<id>.active` 出現。
    - `cursor.moveTo(target, {ms=750})`：target 為 selector 字串或 `{x,y}`；easeInOutCubic 軌跡。
    - `cursor.click(target, {hover=400, ms=750})`：移動→懸停→按下（漣漪）→放開。
    - `cursor.drag(target, to, {ms=900, hover=300})`：to 為 `{x,y}` 絕對或 `{dx,dy}` 相對。
    - `cursor.type(selector, text)`：click 後以 55ms/字打字。
  - CLI：`npm run demo:record -- <scenario> [--take N]`；輸出 `demo-videos/<name>[.takeN].mp4` + `demo-videos/stills/<name>.png`。

- [ ] **Step 1: 寫 `scripts/demo/cursor.mjs`**

```js
/* 合成游標：headed 錄影不含 OS 游標，注入 overlay 圓點 + 點擊漣漪。
   節奏規則（spec §6）：移動 600-900ms easing、懸停 300-500ms、漣漪 ~400ms。 */

export function cursorInitScript() {
  return `(() => {
    if (window.__dcurInstalled) return; window.__dcurInstalled = true;
    const css = document.createElement('style');
    css.textContent = \`
      #__dcur{position:fixed;left:0;top:0;width:26px;height:26px;border-radius:50%;
        border:2px solid rgba(53,224,166,.9);background:rgba(53,224,166,.18);
        box-shadow:0 0 12px rgba(53,224,166,.35);pointer-events:none;z-index:2147483647;
        transform:translate(-50%,-50%);margin-left:-100px;margin-top:-100px}
      .__dripple{position:fixed;width:26px;height:26px;border-radius:50%;
        border:2px solid rgba(53,224,166,.9);pointer-events:none;z-index:2147483646;
        transform:translate(-50%,-50%) scale(1);opacity:.9;
        transition:transform .4s ease-out,opacity .4s ease-out}\`;
    document.documentElement.appendChild(css);
    const dot = document.createElement('div'); dot.id = '__dcur';
    document.documentElement.appendChild(dot);
    addEventListener('mousemove', (e) => {
      dot.style.marginLeft = '0'; dot.style.marginTop = '0';
      dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px';
    }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = '__dripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'translate(-50%,-50%) scale(2.6)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 450);
    }, true);
  })();`;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createCursor(page) {
  let pos = { x: 960, y: 540 };

  async function resolvePoint(target) {
    if (typeof target !== 'string') {
      if ('dx' in target || 'dy' in target) return { x: pos.x + (target.dx ?? 0), y: pos.y + (target.dy ?? 0) };
      return target;
    }
    const box = await page.locator(target).first().boundingBox();
    if (!box) throw new Error(`cursor: 找不到可視元素 ${target}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  async function glide(to, ms) {
    const from = { ...pos };
    const steps = Math.max(12, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const k = ease(i / steps);
      await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
      await sleep(ms / steps);
    }
    pos = to;
  }

  return {
    async moveTo(target, { ms = 750 } = {}) { await glide(await resolvePoint(target), ms); },
    async click(target, { hover = 400, ms = 750 } = {}) {
      await glide(await resolvePoint(target), ms);
      await sleep(hover);
      await page.mouse.down(); await sleep(70); await page.mouse.up();
    },
    async drag(target, to, { ms = 900, hover = 300 } = {}) {
      await glide(await resolvePoint(target), 700);
      await sleep(hover);
      await page.mouse.down(); await sleep(120);
      await glide(await resolvePoint(to), ms);
      await sleep(120); await page.mouse.up();
    },
    async type(selector, text) {
      await this.click(selector);
      await page.keyboard.type(text, { delay: 55 });
    },
  };
}
```

- [ ] **Step 2: 寫 `scripts/demo/recorder.mjs`**

```js
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
const DSF = 2; // Step 5 probe 定案；1 = 原生、2 = 供裝載端 supersample（見 probe 紀錄）

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
    process.exit(1);
  }
  console.log(`[完成] ${outMp4}`);
  console.log(`[停格] demo-videos/stills/${name}.png`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
```

- [ ] **Step 3: 寫 `scripts/demo/scenarios/probe.mjs`（畫質驗證用，非 9 支正式片）**

```js
/* 10 秒畫質 probe：hero 封面（有影片底圖 + 細字）+ 游標移動，供 DSF 定案目檢。 */
export default {
  name: 'probe',
  targetSec: 10,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('hero');
    await ctx.sleep(1500); // stagger 進場
    ctx.mark('sceneReady');
    await ctx.sleep(2000);
    await ctx.cursor.moveTo('.hchip:nth-child(2)');
    await ctx.sleep(800);
    await ctx.cursor.moveTo('#toOverview');
    await ctx.sleep(3000);
  },
};
```

- [ ] **Step 4: 跑 probe（DSF=1 與 DSF=2 各一次）**

Run: 先把 recorder.mjs 的 `const DSF = 2` 暫改為 `1` → `npm run demo:record -- probe` → 把產出改名 `mv demo-videos/probe.mp4 demo-videos/probe-dsf1.mp4`；改回 `2` → 再跑一次。
Expected: 兩支 mp4 產出、無 pageerror、recorder 正常收尾（dev server 與 Chromium 無殘留：`lsof -i :5288` 空）。
注意：若 `go('hero')` 等 `#s-hero.active` 逾時，代表 section id 慣例與假設不符——檢查實際 DOM（各 screen section 的 id/class），只修 recorder.mjs 的 `go()` 一處即全案生效（勿改各 scenario）。

- [ ] **Step 5: 目檢定案 DSF**

Run: `open demo-videos/probe-dsf1.mp4 demo-videos/probe.mp4`
目檢比較 hero 副標小字與 chips 文字銳利度；**選定較銳利者**（預期 DSF=2 因 supersample 較銳利；若兩者無可辨差異則取 1 省資源）。把定案值固定在 recorder.mjs 的 `DSF` 常數並在該行註解記錄結論；刪除 probe 比較檔 `rm demo-videos/probe*.mp4`。
Expected: `DSF` 常數定案且有註解依據。

- [ ] **Step 6: 三綠燈迴歸**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全綠（本 task 未動 `src/`、未動 tests）。

- [ ] **Step 7: Commit**

```bash
git add scripts/demo/cursor.mjs scripts/demo/recorder.mjs scripts/demo/scenarios/probe.mjs
git commit -m "feat(demo): recorder runner + 合成游標 + probe 畫質定案"
```

---

### Task 3: hero-cover + hero-overview 兩支 scenario

**Files:**
- Create: `scripts/demo/scenarios/hero-cover.mjs`
- Create: `scripts/demo/scenarios/hero-overview.mjs`

**Interfaces:**
- Consumes: Task 2 的 ctx API（`go`/`cursor`/`mark`/`sleep`）與 CLI。
- Produces: `demo-videos/hero-cover.mp4`（~12s）、`demo-videos/hero-overview.mp4`（~13s）+ 對應 stills。

**分鏡依據（spec §3）**：cover = 波浪影片+標題+七 chips 的定場 loop 素材，游標滑過 chips 至第七顆「數位員工」（收官伏筆）；overview = Enter 轉場 → 儀表牆 3×2 stagger → hover 一張模組卡。

- [ ] **Step 1: 寫 `scripts/demo/scenarios/hero-cover.mjs`**

```js
/* 封面 loop 素材：不點擊，游標優雅掃過七 chips 停在「數位員工」。 */
export default {
  name: 'hero-cover',
  targetSec: 12,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('hero');
    await ctx.sleep(1800); // stagger 進場完
    ctx.mark('sceneReady');
    await ctx.sleep(2500); // 靜置定場（標題 + 波浪）
    await ctx.cursor.moveTo('.hchip:nth-child(1)', { ms: 900 });
    await ctx.sleep(500);
    await ctx.cursor.moveTo('.hchip:nth-child(4)', { ms: 900 });
    await ctx.sleep(500);
    await ctx.cursor.moveTo('.hchip:nth-child(7)', { ms: 900 }); // 數位員工（紫）
    await ctx.sleep(2500);
    await ctx.cursor.moveTo({ x: 960, y: 780 }, { ms: 700 }); // 讓開 chips
    await ctx.sleep(3000); // 尾段乾淨波浪，PPT loop 用
  },
};
```

- [ ] **Step 2: 寫 `scripts/demo/scenarios/hero-overview.mjs`**

```js
/* 封面 → Enter 戰情總覽：轉場 + 儀表牆 stagger + hover 模組卡。 */
export default {
  name: 'hero-overview',
  targetSec: 13,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('hero');
    await ctx.sleep(1800);
    ctx.mark('sceneReady');
    await ctx.sleep(1500);
    await ctx.cursor.click('#toOverview', { hover: 500 });
    await ctx.page.waitForSelector('.overview .modwall', { timeout: 10000 });
    await ctx.sleep(2500); // 儀表牆 stagger + sparkline 進場
    await ctx.cursor.moveTo('.modwall > *:nth-child(1)', { ms: 800 });
    await ctx.sleep(1200);
    await ctx.cursor.moveTo('.modwall > *:nth-child(6)', { ms: 900 });
    await ctx.sleep(3000); // payoff：六卡儀表牆全景
  },
};
```

- [ ] **Step 3: 錄製兩支**

Run: `npm run demo:record -- hero-cover && npm run demo:record -- hero-overview`
Expected: 兩支 mp4 + 兩張 stills 產出、exit 0。

- [ ] **Step 4: 目檢**

Run: `open demo-videos/hero-cover.mp4 demo-videos/hero-overview.mp4`
清單：(a) cover 片頭無白屏/半渲染（trim 生效）；(b) 波浪影片有在播放（非靜止 poster）；(c) 游標軌跡平滑、停「數位員工」chip 可辨識；(d) overview 轉場完整、六卡 stagger 入鏡、sparkline 有繪出；(e) 時長 10-14s；(f) stills 是 payoff 畫面。任何一項不過：調整該 scenario 的 sleep/軌跡重錄（重錄免費）。
Expected: 清單全過。

- [ ] **Step 5: Commit**

```bash
git add scripts/demo/scenarios/hero-cover.mjs scripts/demo/scenarios/hero-overview.mjs
git commit -m "feat(demo): hero-cover / hero-overview 兩支開場 scenario"
```

---

### Task 4: policy + dispatch 兩支 scenario（mock 確定性）

**Files:**
- Create: `scripts/demo/scenarios/policy.mjs`
- Create: `scripts/demo/scenarios/dispatch.mjs`

**Interfaces:**
- Consumes: Task 2 ctx API。
- Produces: `demo-videos/policy.mp4`、`demo-videos/dispatch.mp4`（各 ~28-35s）+ stills。

**分鏡依據（spec §4）**：policy = 點情報生成報告（生成動畫+情報流入）→ 綜合對話問一題 → payoff 帶引用來源的回答；dispatch = 風險大字塊+一句話結論 → 切颱風情境（全版玫紅）→ 點列展開法規依據 → payoff 派工卡。

**已探明 selector**：policy `#inboxList`（情報列）/`#gFill`（生成進度）/`#qchips`（預置追問 chips，比自由輸入穩）/`.thread`/`.cite`（引用）；dispatch `#segctl .scbtn[data-scn="typhoon"]`（header 情境切換）/`#mxbody`（七列燈號矩陣）/`#cards`（派工卡）/`#concl`（一句話結論）。

- [ ] **Step 1: 寫 `scripts/demo/scenarios/policy.mjs`**

```js
/* 政策報告：點情報 → 生成動畫 → 綜合對話（用預置 qchip，確定性）→ 引用 payoff。 */
export default {
  name: 'policy',
  targetSec: 32,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('policy');
    await ctx.sleep(1800);
    ctx.mark('sceneReady');
    await ctx.sleep(3000); // 定場：三欄 + MOCK chip
    await ctx.cursor.click('#inboxList > *:nth-child(1)', { hover: 500 });
    await ctx.sleep(4500); // 生成動畫（gbar 進度 + 情報流入）
    await ctx.cursor.moveTo('.thread', { ms: 800 });
    await ctx.sleep(2500); // 看報告內容
    const chip = ctx.page.locator('#qchips > *:nth-child(1)');
    await chip.waitFor({ timeout: 8000 });
    await ctx.cursor.click('#qchips > *:nth-child(1)', { hover: 500 });
    await ctx.sleep(4000); // 綜合對話回答生成
    await ctx.cursor.moveTo('.thread .cite >> nth=0', { ms: 800 }).catch(() => {});
    await ctx.sleep(3500); // payoff：帶 iMarine 引用的回答
  },
};
```

- [ ] **Step 2: 寫 `scripts/demo/scenarios/dispatch.mjs`**

```js
/* 派工：定場（stable）→ 切 typhoon 全版玫紅 → 點矩陣列展開法規依據 → 派工卡 payoff。 */
export default {
  name: 'dispatch',
  targetSec: 32,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('dispatch');
    await ctx.sleep(1800);
    ctx.mark('sceneReady');
    await ctx.sleep(3000); // 定場：風險大字塊 + 一句話結論 + 更新環
    await ctx.cursor.click('#segctl .scbtn[data-scn="typhoon"]', { hover: 500 });
    await ctx.sleep(3500); // 全版轉玫紅 + 矩陣變紅 + 推論動畫
    await ctx.cursor.click('#mxbody > *:nth-child(2)', { hover: 450 });
    await ctx.sleep(3500); // 原位展開規則依據（官方/慣例徽章）
    await ctx.cursor.moveTo('#mxbody > *:nth-child(2)', { ms: 600 });
    await ctx.sleep(1500);
    await ctx.cursor.moveTo('#cards', { ms: 900 });
    await ctx.sleep(4000); // payoff：派工指令卡（停什麼、加派什麼）
  },
};
```

- [ ] **Step 3: 錄製兩支**

Run: `npm run demo:record -- policy && npm run demo:record -- dispatch`
Expected: 兩支 mp4 + stills、exit 0。

- [ ] **Step 4: 目檢**

Run: `open demo-videos/policy.mp4 demo-videos/dispatch.mp4`
清單：(a) policy 生成動畫完整入鏡（gbar 未被跳過）、qchip 回答帶引用；(b) dispatch typhoon 玫紅切換震撼感有出來、展開列的徽章可辨、`#cards` 派工卡為結尾停格；(c) 各支 28-36s；(d) 游標節奏自然；(e) exit 0（零 pageerror）。不過則調 sleep/selector 重錄。
Expected: 清單全過。

- [ ] **Step 5: Commit**

```bash
git add scripts/demo/scenarios/policy.mjs scripts/demo/scenarios/dispatch.mjs
git commit -m "feat(demo): policy / dispatch demo scenario"
```

---

### Task 5: epidemic + alert 兩支 scenario（mock 確定性，Mapbox 需連網）

**Files:**
- Create: `scripts/demo/scenarios/epidemic.mjs`
- Create: `scripts/demo/scenarios/alert.mjs`

**Interfaces:**
- Consumes: Task 2 ctx API。
- Produces: `demo-videos/epidemic.mp4`、`demo-videos/alert.mp4`（各 ~28-35s）+ stills。

**分鏡依據（spec §4）**：epidemic = 船隊清單 → 下鑽 → 拖時間游標（命中脈衝）→ 模擬偵測 → payoff 85 分紅級置頂；alert = 模擬事件兩發（第二發颱風紅色警報頂格）→ cell 全亮+手機插播+漏斗滾數字 → payoff 手機紅色警報。

**已探明 selector**：epidemic `#epiFleet`（船隊清單容器）/`#epiCursor`（時間游標）/`#epiSim`（header 模擬偵測鈕）/`#epiScore`（評分卡）；alert `#simBtn`（header 模擬事件鈕）/`#afeed`（事件流）/`#aphone`（手機 mock）/`#afunnel`（漏斗）。前置：兩頁 Mapbox 需 `.env` 的 `VITE_MAPBOX_TOKEN`（本機已設）與連網——recorder 繼承 process.env，`.env` 由 vite 自行載入，無需另傳。

- [ ] **Step 1: 寫 `scripts/demo/scenarios/epidemic.mjs`**

```js
/* 疫情追溯：定場（管線帶 + 自動選中最高風險船）→ 下鑽另一艘 → 拖時間游標 →
   模擬偵測（新威脅紅級置頂）→ 評分 payoff。 */
export default {
  name: 'epidemic',
  targetSec: 34,
  prereq: '需連網（Mapbox 磚）；.env 需有 VITE_MAPBOX_TOKEN（本機已設）',
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('epidemic');
    await ctx.page.waitForSelector('#epiMap canvas', { timeout: 20000 }); // 地圖磚就緒
    await ctx.sleep(2500); // 管線進場動畫
    ctx.mark('sceneReady');
    await ctx.sleep(3000); // 定場：三分割 + 自動選中最高風險船
    await ctx.cursor.click('#epiFleet > *:nth-child(2)', { hover: 450 }); // 下鑽另一艘
    await ctx.sleep(3000); // 地圖航線 + Epi-Gantt 重繪
    await ctx.cursor.drag('#epiCursor', { dx: 180, dy: 0 }, { ms: 1600 }); // 時間游標：船沿航線移動
    await ctx.sleep(2000);
    await ctx.cursor.click('#epiSim', { hover: 500 }); // 模擬偵測：新威脅
    await ctx.sleep(4500); // 紅級置頂動畫 + 命中脈衝
    await ctx.cursor.moveTo('#epiScore', { ms: 800 });
    await ctx.sleep(3500); // payoff：85 分紅級 + 評分依據
  },
};
```

- [ ] **Step 2: 寫 `scripts/demo/scenarios/alert.mjs`**

```js
/* 警報：定場（自動選中最高風險 + 圍欄）→ 模擬第一發（作業提示）→
   第二發（颱風紅色警報頂格：cell 全亮 + 手機全螢幕插播 + 雙漏斗滾數字）→ 手機 payoff。 */
export default {
  name: 'alert',
  targetSec: 34,
  prereq: '需連網（Mapbox 磚）；.env 需有 VITE_MAPBOX_TOKEN（本機已設）',
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('alert');
    await ctx.page.waitForSelector('#amap canvas', { timeout: 20000 });
    await ctx.sleep(2200);
    ctx.mark('sceneReady');
    await ctx.sleep(3000); // 定場：事件流 + 覆蓋地圖 + 手機
    await ctx.cursor.click('#simBtn', { hover: 500 }); // 第一發：作業提示（雷擊）
    await ctx.sleep(4000); // 等動畫完（防重入窗口）
    await ctx.cursor.click('#simBtn', { hover: 450 }); // 第二發：紅色警報（颱風）頂格
    await ctx.sleep(6500); // cell 全亮 stagger + 波紋 + 手機插播抖動 + 漏斗滾數字
    await ctx.cursor.moveTo('#aphone', { ms: 900 });
    await ctx.sleep(3500); // payoff：手機紅色警報全螢幕插播
  },
};
```

- [ ] **Step 3: 錄製兩支**

Run: `npm run demo:record -- epidemic && npm run demo:record -- alert`
Expected: 兩支 mp4 + stills、exit 0。

- [ ] **Step 4: 目檢**

Run: `open demo-videos/epidemic.mp4 demo-videos/alert.mp4`
清單：(a) 兩頁 Mapbox 磚完整載入（無灰格）；(b) epidemic 游標拖曳時船位有沿航線移動、模擬偵測後紅級置頂；(c) alert 兩發節奏正確（第二發未被防重入吃掉）、手機插播與漏斗滾數字入鏡；(d) 各支 28-36s；(e) exit 0。若第二發被防重入擋住 → 加長第一發後的 sleep 重錄。
Expected: 清單全過。

- [ ] **Step 5: Commit**

```bash
git add scripts/demo/scenarios/epidemic.mjs scripts/demo/scenarios/alert.mjs
git commit -m "feat(demo): epidemic / alert demo scenario"
```

---

### Task 6: twin scenario（live 原生自繪）

**Files:**
- Create: `scripts/demo/scenarios/twin.mjs`

**Interfaces:**
- Consumes: Task 2 ctx API。
- Produces: `demo-videos/twin.mp4`（~30-35s）+ still。

**分鏡依據（spec §4）**：港區 2.5D 全景（船隻動態）→ 拖 24hr 時間軸推演 → 泊位佔用變化 → payoff 未來時刻港區狀態。
**已探明 selector**：`#twinView`（WebGL canvas）/`.mtab[data-tab="future"]`（未來推演分頁）/`#play`（播放鈕）/`#tslider`（時間軸 range input）/`#gantt`（泊位 Gantt）/`#shipchip`（點船 chip）。spec 註明 twin 細節以實際畫面為準——本 task Step 1 先行探明再定稿。

- [ ] **Step 1: 探明 twin 實際互動（不猜）**

Run:
```bash
node node_modules/vite/bin/vite.js --port 5288 --strictPort & VITE_PID=$!   # 直接跑 vite 執行檔，kill 才殺得乾淨
sleep 3 && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch({ headless: false });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('http://localhost:5288/#/twin');
  await p.waitForSelector('#s-twin.active');
  await p.waitForTimeout(4000);
  console.log(await p.evaluate(() => ({
    playPressed: document.querySelector('#play')?.textContent,
    sliderMin: document.querySelector('#tslider')?.min,
    sliderMax: document.querySelector('#tslider')?.max,
    sliderVal: document.querySelector('#tslider')?.value,
    tabs: [...document.querySelectorAll('.mtab')].map(t => t.textContent),
    clock: document.querySelector('#tclock')?.textContent,
  })));
  await b.close(); process.exit(0);
});"
kill $VITE_PID
```
Expected: 印出 slider 範圍、播放鈕狀態、分頁文字。回放預設不自動播放已由程式碼證實（`src/screens/twin/timeline.ts` 的 `playing = false`），scenario 已內建點 `#play`；本步重點是確認 **future 分頁下** slider 範圍與 `#gantt` 行為，據此微調 Step 2 的拖曳幅度與 sleep（調整處以註解標記依據）。

- [ ] **Step 2: 寫 `scripts/demo/scenarios/twin.mjs`**

```js
/* 數位孿生：全景（AIS 回放）→ 點船 chip → 切「未來推演」→ 拖 24hr 時間軸 →
   泊位 Gantt 變化 payoff。live（原生直繪，無外部後端）。 */
export default {
  name: 'twin',
  targetSec: 33,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('twin');
    await ctx.page.waitForSelector('#twinView', { timeout: 15000 });
    await ctx.sleep(2500); // 場景初繪
    ctx.mark('sceneReady');
    await ctx.sleep(1500); // 定場：港區全景
    await ctx.cursor.click('#play', { hover: 400 }); // 已驗證 timeline.ts 預設 playing=false → 需點播放
    await ctx.sleep(3000); // 船隻沿 AIS 軌跡回放動態
    await ctx.cursor.click('#twinView', { hover: 400 }); // 點船：中心附近射線挑船
    await ctx.sleep(2500); // #shipchip 船隻資訊
    await ctx.cursor.click('.mtab[data-tab="future"]', { hover: 500 });
    await ctx.sleep(2500); // 未來推演面板切入
    const box = await ctx.page.locator('#tslider').boundingBox();
    await ctx.cursor.drag(
      { x: box.x + box.width * 0.15, y: box.y + box.height / 2 },
      { x: box.x + box.width * 0.85, y: box.y + box.height / 2 },
      { ms: 2600 },
    ); // 24hr 推演：由近而遠拖到未來時刻
    await ctx.sleep(2000);
    await ctx.cursor.moveTo('#gantt', { ms: 900 });
    await ctx.sleep(3500); // payoff：未來時刻泊位佔用
  },
};
```

- [ ] **Step 3: 錄製**

Run: `npm run demo:record -- twin`
Expected: mp4 + still、exit 0。

- [ ] **Step 4: 目檢**

Run: `open demo-videos/twin.mp4`
清單：(a) WebGL 場景真 GPU 渲染品質（船體/水面無 SwiftShader 破圖）；(b) 點船有出 `#shipchip`（點空白則調整點擊座標往泊位區）；(c) 拖時間軸時鐘/場景/Gantt 有連動；(d) 30-36s；(e) exit 0。
Expected: 清單全過。

- [ ] **Step 5: Commit**

```bash
git add scripts/demo/scenarios/twin.mjs
git commit -m "feat(demo): twin 沙盤推演 demo scenario"
```

---

### Task 7: carbon scenario（live，需 PoC 後端）

**Files:**
- Create: `scripts/demo/scenarios/carbon.mjs`

**Interfaces:**
- Consumes: Task 2 ctx API。
- Produces: `demo-videos/carbon.mp4`（~30-35s）+ still。

**分鏡依據（spec §4）**：進頁（LIVE chip）→ 發行一筆 SU（真上鏈）→ 掛單 → 成交 → payoff 鏈上確認+餘額變動。
**已探明 selector**：`[data-lg-open="#m-issue-one"]`（單筆發行 opener）/`#m-issue-one` modal 欄位 `#one-ship` `#one-fuel` `#one-mj` `#one-gfi` `#one-period`/`#btn-issue-one-go`（確認發行）/`#m-list`+`#list-price`+`#btn-list-go`（掛單）/`#m-buy`+`#btn-buy-go`（購買成交）/`.fchip` 狀態篩選（`data-n` 計數）。掛單/購買的 opener 依同一 `data-lg-open` 模式（Step 2 實測確認）。

- [ ] **Step 1: 起 PoC 後端（乾淨鏈態）**

Run:
```bash
cd ../iMarine-Carbon-Tokenization-POC && make chain   # 長駐進程（背景執行或另開終端）：Hardhat :8545；重起 = 鏈上狀態歸零，數字可重現
# 另一個終端（同為長駐進程）：
cd ../iMarine-Carbon-Tokenization-POC && make api     # FastAPI :8000
curl -s http://localhost:8000/health
```
Expected: health 回 200。**注意：若使用者已自行起 :8000/:8545，先詢問使用者是否可重起（重起會清鏈上資料）；不可重起就照現況錄（數字非零起跳，僅影響美觀不影響正確性）。**

- [ ] **Step 2: 實測探明掛單/購買 opener 與 modal 欄位**

Run:
```bash
node node_modules/vite/bin/vite.js --port 5288 --strictPort & VITE_PID=$!   # 直接跑 vite 執行檔，kill 才殺得乾淨
sleep 3 && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch({ headless: false });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('http://localhost:5288/#/carbon');
  await p.waitForSelector('#s-carbon.active');
  await p.waitForTimeout(3000);
  console.log(await p.evaluate(() => ({
    openers: [...document.querySelectorAll('[data-lg-open]')].map(b => [b.getAttribute('data-lg-open'), b.textContent.trim()]),
    listFields: [...document.querySelectorAll('#m-list input, #m-list select')].map(i => i.id || i.name),
    buyFields: [...document.querySelectorAll('#m-buy input, #m-buy select')].map(i => i.id || i.name),
    oneDefaults: [...document.querySelectorAll('#m-issue-one input, #m-issue-one select')].map(i => [i.id, i.value]),
  })));
  await b.close(); process.exit(0);
});"
kill $VITE_PID
```
Expected: 印出掛單/購買 opener 的實際位置（頂部鈕或資產列內鈕）與 modal 欄位清單。**依結果把 Step 3 代碼檔頭的 `SEL` 常數與欄位填寫段定稿**（發行 modal 欄位有預設值就不重打，只改必要欄位）。

- [ ] **Step 3: 寫 `scripts/demo/scenarios/carbon.mjs`**

```js
/* 碳權（live）：發行一筆 SU 真上鏈 → 上架掛單 → 購買成交 → 鏈上確認 payoff。
   SEL 常數依 Task 7 Step 2 實測定稿；欄位預設值能用就不重打。 */
const SEL = {
  issueOpen: '[data-lg-open="#m-issue-one"]',
  issueGo: '#btn-issue-one-go',
  listOpen: '[data-lg-open="#m-list"]',   // Step 2 若實測為資產列內鈕，改為該列 selector
  listPrice: '#list-price',
  listGo: '#btn-list-go',
  buyOpen: '[data-lg-open="#m-buy"]',
  buyGo: '#btn-buy-go',
};
export default {
  name: 'carbon',
  targetSec: 33,
  prereq: 'PoC 後端需已啟動（make chain + make api，:8545/:8000）；重起 chain 可得乾淨數字',
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('carbon');
    await ctx.sleep(1800);
    ctx.mark('sceneReady');
    await ctx.sleep(3000); // 定場：LIVE chip + KPI 統計列
    await ctx.cursor.click(SEL.issueOpen, { hover: 500 });
    await ctx.sleep(1500); // modal 開（欄位帶現場驗證數據預設值）
    await ctx.cursor.click(SEL.issueGo, { hover: 600 });
    await ctx.sleep(3000); // 上鏈等待 + 成功回饋（audit feed / KPI +1）
    await ctx.cursor.click(SEL.listOpen, { hover: 500 });
    await ctx.sleep(1200);
    await ctx.cursor.type(SEL.listPrice, '1280'); // 掛單價（type 前自動 click 聚焦）
    await ctx.sleep(600);
    await ctx.cursor.click(SEL.listGo, { hover: 500 });
    await ctx.sleep(2500); // 掛單上鏈
    await ctx.cursor.click(SEL.buyOpen, { hover: 500 });
    await ctx.sleep(1200);
    await ctx.cursor.click(SEL.buyGo, { hover: 600 });
    await ctx.sleep(3000); // 成交上鏈
    await ctx.cursor.moveTo('.audit', { ms: 900 }); // 稽核 feed：鏈上事件流水
    await ctx.sleep(3500); // payoff：鏈上確認 + 餘額/計數變動
  },
};
```

- [ ] **Step 4: 錄製**

Run: `npm run demo:record -- carbon`
Expected: mp4 + still、exit 0；影片中 KPI 計數與 `data-n` 篩選數字有隨三次上鏈操作變動。

- [ ] **Step 5: 目檢**

Run: `open demo-videos/carbon.mp4`
清單：(a) 標題列 LIVE chip 入鏡；(b) 發行→掛單→成交三步驟完整、每步有鏈上回饋（等待態+成功態）；(c) payoff 停在稽核/餘額變動；(d) 30-36s（若上鏈等待造成超長 → 對等待段補 `mark` + `post.ramps` 1.5-2x 重錄）；(e) exit 0。
Expected: 清單全過。

- [ ] **Step 6: Commit**

```bash
git add scripts/demo/scenarios/carbon.mjs
git commit -m "feat(demo): carbon live 上鏈全流程 demo scenario"
```

---

### Task 8: agent-finale scenario（live Gemini，多 take）

**Files:**
- Create: `scripts/demo/scenarios/agent-finale.mjs`

**Interfaces:**
- Consumes: Task 2 ctx API（含 `--take N`）；Task 7 的 PoC 後端（掛單工具真打 :8000）。
- Produces: `demo-videos/agent-finale.mp4`（後製後 ~70-85s）+ still。

**分鏡依據（spec §5 六幕）**。**順序修正**：live 事件流中互動掛單卡（confirm）發生在最終回答之前、citation chips 在最終回答文字裡——故實錄順序為「巡檢 → 指令 → plan/工具卡 → 掛單卡互動 → 上鏈 → 最終回答（citation）→ 點 citation 跳頁返回 → SUGGEST」，幕 4/5 對調，六幕內容不變；**Task 9 的簡報腳本文件分鏡表照實錄順序撰寫**。
**已探明 selector**：`#aInput`/`#aSend`/`#aChips`（開場 chips）/`.lampwall`（巡檢燈牆）/`.confirmcard`+`.csel`（SU 下拉）+`.cprice`（總價）+`.cper`（每噸換算）+`.cbtn.ok`/`.mchip`（citation chip）/`.schip`（SUGGEST）。

- [ ] **Step 1: 前置檢查**

Run: `curl -s http://localhost:8000/health && grep -c "VITE_GEMINI_API_KEY=." .env || echo "KEY MISSING"`
Expected: PoC 後端 200；`.env` 有非空 Gemini key（vite 自動載入，錄製 dev server 繼承）。**若 `.env` 無 key：請使用者以 `VITE_GEMINI_API_KEY=<key> npm run demo:record -- agent-finale --take 1` 形式提供（環境變數傳入，不寫檔、不入鏡）。**

- [ ] **Step 2: 寫 `scripts/demo/scenarios/agent-finale.mjs`**

```js
/* 數位員工收官（live Gemini）：巡檢 → 一句話跨模組指令 → plan/工具卡 →
   互動掛單卡（human-in-the-loop，真上鏈）→ 最終回答 citation 跳頁返回 → SUGGEST。
   Gemini 等待段以 marks 圍住、後製 1.75x ramp；每次回答不同 → 跑 2-3 take 挑最好。 */
const ORDER = '幫我盤點六大模組狀態整理成今日戰情摘要，另外看碳權市場現況，把我持有的 SU 挑一批掛單上架';
export default {
  name: 'agent-finale',
  targetSec: 80,
  prereq: 'PoC 後端已啟動（:8000）；Gemini key 經 .env 或環境變數提供；建議 --take 1..3 多錄挑選',
  post: {
    trimAtMark: 'sceneReady',
    ramps: [
      { from: 'think1', to: 'card', factor: 1.75 },   // 指令送出 → 掛單卡出現（工具鏈執行）
      { from: 'think2', to: 'answer', factor: 1.75 }, // 確認掛單 → 最終回答
    ],
  },
  async run(ctx) {
    await ctx.go('agent');
    await ctx.sleep(1500);
    ctx.mark('sceneReady');
    // 幕 1：開場自我巡檢（7 燈卡 + 招呼 + 3 chips）
    await ctx.page.waitForSelector('#aChips > *', { timeout: 30000 });
    await ctx.sleep(3000);
    await ctx.cursor.moveTo('.lampwall', { ms: 900 });
    await ctx.sleep(2000);
    // 幕 2：一句話跨模組指令（GEMINI LIVE chip 已在標題列）
    await ctx.cursor.type('#aInput', ORDER);
    await ctx.sleep(600);
    await ctx.cursor.click('#aSend', { hover: 400 });
    ctx.mark('think1');
    // 幕 3：plan-then-act + 工具卡（等互動掛單卡出現；live 時長不定 → ramp 吸收）
    await ctx.page.waitForSelector('.confirmcard .csel', { timeout: 120000 });
    ctx.mark('card');
    await ctx.sleep(1500);
    // 幕 4：互動掛單卡——挑 SU、改總價、看每噸換算、確認（human-in-the-loop）
    await ctx.cursor.moveTo('.confirmcard', { ms: 700 });
    await ctx.page.locator('.confirmcard .csel').selectOption({ index: 1 }).catch(() => {});
    await ctx.sleep(1200);
    await ctx.cursor.click('.confirmcard .cprice', { hover: 350 });
    await ctx.page.keyboard.press('Meta+a');
    await ctx.page.keyboard.type('1350', { delay: 70 });
    await ctx.sleep(1500); // .cper 折合每噸即時換算
    await ctx.cursor.click('.confirmcard .cbtn.ok', { hover: 600 });
    ctx.mark('think2');
    // 幕 5：真上鏈 + 最終回答（citation chips）。SUGGEST 由模型自主決定、非必然出現，
    // 缺席不算 take 失敗（timeout 吞掉、以逾時當回答完成點，目檢再判斷 take 可用性）。
    await ctx.page.waitForSelector('.schip', { timeout: 120000 }).catch(() => {});
    ctx.mark('answer');
    await ctx.sleep(2500);
    const cite = ctx.page.locator('.mchip').first();
    if (await cite.count()) {
      await ctx.cursor.click('.mchip >> nth=0', { hover: 500 }); // citation 跳對應模組頁
      await ctx.sleep(2500);
      await ctx.page.keyboard.press('7'); // 鍵盤 7 返回 agent，thread 保留
      await ctx.sleep(2000);
    }
    // 幕 6：SUGGEST 追問 chips + payoff 停格（GEMINI LIVE 入鏡）；無 SUGGEST 則停在回答尾
    if (await ctx.page.locator('.schip').count()) {
      await ctx.cursor.moveTo('.schip >> nth=0', { ms: 800 });
    } else {
      await ctx.cursor.moveTo('#aThread', { ms: 800 });
    }
    await ctx.sleep(4000);
  },
};
```

- [ ] **Step 3: 錄 2-3 個 take**

Run: `npm run demo:record -- agent-finale --take 1`（重複 `--take 2`、必要時 `--take 3`）
Expected: 各 take exit 0。已知變因：Gemini 可能不呼叫 `list_holdable_units`（掛單卡退化為手動輸入）或 plan 步數不同——不算失敗，挑「掛單卡帶 SU 下拉 + 回答帶 citation」的 take。

- [ ] **Step 4: 挑 take 定稿**

Run: `open demo-videos/agent-finale.take*.mp4`
目檢清單：(a) GEMINI LIVE chip 入鏡；(b) 六幕俱全（巡檢燈牆/指令/工具卡/掛單卡互動含每噸換算/citation 跳頁返回/SUGGEST）；(c) ramp 後總長 70-90s、等待段不冗長；(d) 掛單真上鏈（工具卡顯示成功而非示範模式字樣）。挑最好的一支：
```bash
cp demo-videos/agent-finale.take2.mp4 demo-videos/agent-finale.mp4   # 以實際挑中的 take 為準
ffmpeg -y -sseof -0.3 -i demo-videos/agent-finale.mp4 -frames:v 1 -update 1 demo-videos/stills/agent-finale.png
rm demo-videos/agent-finale.take*.mp4
```
Expected: `agent-finale.mp4` + still 定稿。

- [ ] **Step 5: Commit**

```bash
git add scripts/demo/scenarios/agent-finale.mjs
git commit -m "feat(demo): agent-finale live Gemini 收官 scenario（多 take + ramp）"
```

---

### Task 9: 簡報腳本文件（docs/presentation/簡報腳本.md）

**Files:**
- Create: `docs/presentation/簡報腳本.md`

**Interfaces:**
- Consumes: spec §3（時間軸）/§4（六模組分鏡+why 痛點）/§5（收官六幕，**依 Task 8 實錄順序修正幕 4/5**）；報告書 v6 PDF（`../內文V6/報告書_完整版_v6_加入引用連結.pdf`）的參考數字與 iMarine 資料集名稱；`demo-videos/` 實際片長（`ffprobe` 讀）。
- Produces: 簡報者可直接照稿排練的單一文件。

- [ ] **Step 1: 從報告書 v6 萃取素材**

Run: 以 Read 工具分頁讀 PDF（每次 ≤20 頁），萃取：(a) 每模組使用的 iMarine 資料集正式名稱；(b) 每模組的量化效益數字（減碳噸數/節省工時等）；(c) 三大命題的引用數字（EU ETS 2026、航運產業升級方案 24.5 億等）；(d) AI 技術名詞（ConvLSTM、RAG、多目標排程等以報告書用語為準）。整理成工作筆記（scratch，不進版控）。
Expected: 六模組 × (iMarine 資料集 + 量化數字 + AI 技術) 對照筆記完成；報告書沒寫的欄位標「報告書未載，講稿留白待使用者補」，不得杜撰。

- [ ] **Step 2: 讀取實際片長**

Run: `for f in demo-videos/*.mp4; do echo "$f $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"; done`
Expected: 9 支片長清單（cue 表用真實秒數，不用估計值）。

- [ ] **Step 3: 撰寫 `docs/presentation/簡報腳本.md`**

文件結構（內容依 Step 1/2 素材填寫，全繁中+英術語、無 emoji）：

```markdown
# 決賽簡報腳本（8-10 分鐘 · 影片版系統展示）

> 對應 spec：docs/superpowers/specs/2026-07-12-ppt-presentation-demo-design.md
> 影片素材：demo-videos/（可用 npm run demo:record -- <名> 單支重錄）

## 0. 主軸句（開場提出、結尾回收）
[三個候選句 + 建議，供簡報者挑選定稿]

## 1. 總時間軸與 cue 表
[表：段落 | 講稿起始句 | 秒數 | 影片檔 | 實際片長 | 按播放的 cue（講到哪句按）]

## 2. 開場 hook（~60s）
[講稿要點逐條 + 三大命題數字（出處：報告書 v6 §…）]

## 3. 系統架構（~45s）
[講稿要點 + hero-overview.mp4 播放時的同步解說詞]

## 4-9. 六模組（各 ~60s，順序 carbon→policy→twin→dispatch→epidemic→alert）
每模組固定小節：
### 4.x why（15s 講稿）
### 4.x how（15s 講稿，含 iMarine 資料集點名 + AI 技術）
### 4.x demo（30s，影片分鏡對照表：秒數段 | 畫面在做什麼 | 講者同步說什麼 | payoff 句)

## 10. 數位員工收官（~90s）
[六幕分鏡對照表，依實錄順序：巡檢→指令→工具卡→掛單卡→回答+citation→SUGGEST]

## 11. 結尾（~30s）
[量化效益回收 + 評分項對照表（創新/完整/可行/iMarine/AI 各對到簡報哪一段）+ 主軸句回收]

## 12. 播放備援
[影片檔隨身碟清單 + stills/ 截圖附錄頁對照 + 影片掛掉時的口播降級流程]

## 13. 重錄索引
[表：影片 | 依賴後端 | 上線後重錄指令]
```

Expected: 文件完成，無留白段落（除 Step 1 標記的「報告書未載」項）。

- [ ] **Step 4: 對照 spec 驗收條款自查**

核對 spec §9.1：段落 0-9 全覆蓋、每段講稿要點+秒數+影片檔名+步驟級分鏡、cue 表、iMarine/AI 對照——逐項打勾；缺項回 Step 3 補。
Expected: §9.1 全數符合。

- [ ] **Step 5: Commit**

```bash
git add docs/presentation/簡報腳本.md
git commit -m "docs(presentation): 決賽簡報腳本（時間軸/講稿/cue 表/分鏡/備援）"
```

---

### Task 10: 全案驗收 + HANDOFF 收尾

**Files:**
- Modify: `HANDOFF.md`（最後更新段 + 第 1 節加本輪紀錄）
- 驗收對象: `demo-videos/`（9 mp4 + 9 stills）、`docs/presentation/簡報腳本.md`、三綠燈

- [ ] **Step 1: 產物清點**

Run: `ls demo-videos/*.mp4 demo-videos/stills/*.png | sort`
Expected: 恰好 9 支 mp4（hero-cover/hero-overview/carbon/policy/twin/dispatch/epidemic/alert/agent-finale）+ 9 張 png，無 take 殘留、無 probe 殘留。

- [ ] **Step 2: 重錄一致性驗證（spec §9.5）**

Run:
```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 demo-videos/dispatch.mp4   # 先記下舊片長（重錄會覆蓋）
npm run demo:record -- dispatch
ffprobe -v error -show_entries format=duration -of csv=p=0 demo-videos/dispatch.mp4   # 新片長
```
新舊片長差 ±0.5s 內，並快速目檢節奏一致。
Expected: 片長一致、內容節奏一致（確定性 scenario 的可重現性成立）。

- [ ] **Step 3: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全綠；`git status` 確認 `demo-videos/` 未入版控、`.env` 未動。

- [ ] **Step 4: 殘留風險核對（spec §8）**

逐列核對：後端埠未佔用衝突、mock 頁 MOCK chip 照實入鏡已知悉、小字時刻是否需要動用「靜態 zoom cut」後備（若目檢認定某支有不可辨識的關鍵數字 → 於該支 scenario 補 marks 並在 ffmpeg.mjs 擴充 crop 參數，另立 commit；預設不做）。
Expected: 風險表逐項有結論。

- [ ] **Step 5: 更新 HANDOFF.md**

首行「最後更新」改寫 + 第 1 節頂部加本輪段落：產出（腳本文件/9 支影片/錄製管線）、重錄方式（`npm run demo:record -- <名>`、後端上線後重錄對照 §13 索引）、誠實分野（哪幾支是 mock 態錄的、agent-finale 挑了第幾個 take、報告書未載而留白的講稿欄位）、待使用者事項（影片目檢最終確認、主軸句挑選、PPT 製作為 out of scope）。
Expected: HANDOFF 反映本輪完整狀態。

- [ ] **Step 6: Commit**

```bash
git add HANDOFF.md
git commit -m "docs(handoff): 簡報腳本 + demo 影片錄製管線輪收尾"
```

---

## Self-Review 紀錄（計畫撰寫時已執行；第二輪對實碼驗證後修正）

1. **Spec coverage**：§3 時間軸→Task 9；§4 六模組分鏡→Task 3-7（含大元素優先與 zoom cut 後備→Task 10 Step 4）；§5 收官→Task 8（幕 4/5 順序依 live 事件流對調，已於 Task 8/9 註明同步）；§6 錄製架構→Task 1-2（游標定量/ramp/解析度 probe）；§7 檔案版控→Task 1（gitignore）+ 各 task 檔案位置；§8 風險→Task 5 prereq（Mapbox）、Task 7 Step 1（鏈重置+使用者既有後端詢問）、Task 8（多 take）、Task 10 Step 4；§9 驗收→Task 9 Step 4 + Task 10；§10 out of scope 未越界（不做 PPT 頁面/字幕/後端）。
2. **Placeholder scan**：無 TBD/TODO；Task 6 Step 1 與 Task 7 Step 2 為「實測探明再定稿」步驟，附具體探測指令與定稿位置（SEL 常數/註解），非佔位。
3. **Type consistency**：`buildConvertArgs`/`buildStillArgs`/`cursorInitScript`/`createCursor`/ctx API（`go`/`sleep`/`mark`/`log`/`cursor.{moveTo,click,drag,type}`）/scenario 契約（`name`/`targetSec`/`prereq`/`env`/`post.{trimAtMark,ramps}`/`run`）在 Task 1/2 定義後，Task 3-8 引用名稱一致。
4. **第二輪：假設對實碼驗證（2026-07-12）**：(a) `#s-<id>` section id 慣例——`src/shell/router.ts:48` 證實；(b) hash 格式 `#/<id>`——`router.ts` `parseHash` 證實；(c) agent 掛單卡 `.csel` 為原生 `<select>`——`controller.ts:292` 證實，`selectOption` 可用；(d) **twin 回放預設不自動播放**（`timeline.ts` `playing = false`）——原 scenario 假設「回放播放中」有誤，已改為明確點 `#play`；(e) policy `#qchips` 為 mount 期填入的預置問題，scenario 的 8s waitFor 足夠。
5. **第二輪：工程修正**：recorder 改直接 spawn `node_modules/vite/bin/vite.js`（npx 子進程 SIGTERM 殺不乾淨會留孤兒 dev server）、vite stdout 改 `ignore`（pipe 未消費會背壓塞住長錄製）、轉檔後 `rmSync` raw webm；Task 8 `.schip`（SUGGEST）改為非必然出現的 guard（waitFor 吞 timeout + 結尾 hover 分支）；Task 10 重錄一致性驗證改為「先記舊片長再重錄」；片長驗收區間統一 28-36s。

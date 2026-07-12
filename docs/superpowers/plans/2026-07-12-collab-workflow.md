# 協作流程優化（collab workflow）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地方案 B 四件套——CONTRIBUTING.md、docs/collab/ 整合卡、GitHub Actions CI、scripts/verify/ 雙層驗收腳本——解決協作四痛點（PR 品質、契約對齊、整合測試、資訊銜接）。

**Architecture:** 純增量：不動 `src/` 內任何檔案。驗收腳本 = 共用純函式 lib（TDD）+ 兩支 runner（契約 smoke 直打後端、Playwright live 驗頁面）+ 每模組一個契約/斷言檔（policy 實作、其餘三模組誠實骨架）。文件 = CONTRIBUTING（流程與範圍）+ docs/collab（整合卡，契約隨 PR 進版控）。CI 只跑不依賴後端的三綠燈。

**Tech Stack:** Node 22、原生 `fetch`/`AbortController`、playwright（已在 devDependencies，零新依賴）、vitest（jsdom）、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-07-12-collab-workflow-design.md`（已核可）。

## Global Constraints

- 禁止動 `src/` 內任何檔案；`src/` 外改動僅限本計畫明列的檔案。
- 禁止 emoji；文件繁體中文 + 英文術語。
- commit 訊息不加任何 Claude/Anthropic 署名（無 `Co-Authored-By`）；author 沿用使用者 git config（charles）。
- 不主動 `git push`、不開 PR、不對 GitHub 做外顯操作（CI 首跑與 branch protection 是使用者手動步驟）。
- 分支：`collab-workflow`，自 main 分出。
- 驗收腳本不得占用使用者既有 port（5173/5174/5288/5301/8000/8100/8545）；live runner 固定用 **5320** `--strictPort`。
- 不新增任何 npm 依賴。
- 三綠燈基線：`tsc --noEmit` 0 errors、vitest 28 檔 132 tests（本計畫新增測試在基線上增加）、`vite build` 成功。
- rag-agent（:8100）本機不一定起得來：所有對它的實測步驟都分「後端在」與「後端不在」兩路，後端不在時驗失敗路徑並如實記錄，不假裝跑過 live。

---

### Task 1: verify 共用 lib 純函式（TDD）

**Files:**
- Create: `scripts/verify/lib.mjs`
- Create: `scripts/verify/lib.d.mts`
- Test: `tests/verify-lib.test.ts`

**Interfaces:**
- Consumes: 無（首個 task）。
- Produces（Task 2/3 依賴的精確簽名）:
  - `checkFields(obj: unknown, spec: Record<string, string>): string[]` — 驗物件欄位形狀；spec 值為 `'string' | 'number' | 'boolean' | 'array' | 'object'`，尾綴 `?` 表選填（缺席不報錯、存在則驗型別）；回傳不符訊息陣列，空陣列＝通過。
  - `summarize(results: {name: string, ok: boolean, detail?: string}[]): {passed: number, failed: number, exitCode: number}` — failed>0 → exitCode 1，否則 0。
  - `formatResults(results: {name: string, ok: boolean, detail?: string}[]): string` — 每項一行 `PASS/FAIL  name`，有 detail 加縮排第二行。
  - `fetchJson(url: string, init?: RequestInit, timeoutMs?: number): Promise<any>` — 原生 fetch + AbortController 逾時（預設 5000ms）、非 2xx throw `HTTP <status> <url>`（I/O 函式，不進 vitest，僅 d.mts 宣告）。

- [ ] **Step 0: 建分支**

```bash
git checkout -b collab-workflow main
```

- [ ] **Step 1: 寫失敗測試**

`tests/verify-lib.test.ts`（比照 `tests/demo-ffmpeg.test.ts` 的 mjs import 先例）：

```ts
import { describe, it, expect } from 'vitest';
import { checkFields, summarize, formatResults } from '../scripts/verify/lib.mjs';

describe('checkFields', () => {
  it('欄位齊且型別正確 → 空陣列', () => {
    expect(checkFields({ a: 'x', n: 1, b: true, arr: [], o: {} },
      { a: 'string', n: 'number', b: 'boolean', arr: 'array', o: 'object' })).toEqual([]);
  });
  it('缺必填欄位 → 報缺欄位', () => {
    expect(checkFields({}, { a: 'string' })).toEqual(['缺欄位 a']);
  });
  it('型別不符 → 報預期/實際', () => {
    expect(checkFields({ a: 1 }, { a: 'string' })).toEqual(['欄位 a 預期 string，得到 number']);
  });
  it('選填欄位（尾綴 ?）缺席不報錯、存在則驗型別', () => {
    expect(checkFields({}, { a: 'string?' })).toEqual([]);
    expect(checkFields({ a: 1 }, { a: 'string?' })).toEqual(['欄位 a 預期 string，得到 number']);
  });
  it('array 與 object 區分（Array 不算 object）', () => {
    expect(checkFields({ a: [] }, { a: 'object' })).toEqual(['欄位 a 預期 object，得到 array']);
  });
  it('null 欄位視為 null 型別', () => {
    expect(checkFields({ a: null }, { a: 'string' })).toEqual(['欄位 a 預期 string，得到 null']);
  });
  it('非物件輸入 → 單則錯誤', () => {
    expect(checkFields(null, { a: 'string' })).toEqual(['預期物件，得到 null']);
    expect(checkFields([], { a: 'string' })).toEqual(['預期物件，得到 array']);
  });
});

describe('summarize', () => {
  it('全過 → exitCode 0', () => {
    expect(summarize([{ name: 'a', ok: true }])).toEqual({ passed: 1, failed: 0, exitCode: 0 });
  });
  it('任一失敗 → exitCode 1', () => {
    expect(summarize([{ name: 'a', ok: true }, { name: 'b', ok: false }]))
      .toEqual({ passed: 1, failed: 1, exitCode: 1 });
  });
  it('空清單 → 全零', () => {
    expect(summarize([])).toEqual({ passed: 0, failed: 0, exitCode: 0 });
  });
});

describe('formatResults', () => {
  it('每項一行 PASS/FAIL，有 detail 加縮排行', () => {
    expect(formatResults([
      { name: 'x', ok: true },
      { name: 'y', ok: false, detail: '原因' },
    ])).toBe('PASS  x\nFAIL  y\n      原因');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd "/Users/charles88/Desktop/2026航港大數據創意應用競賽/iMarine-FrontEnd" && npx vitest run tests/verify-lib.test.ts`
Expected: FAIL（`Cannot find module '../scripts/verify/lib.mjs'`）

- [ ] **Step 3: 最小實作**

`scripts/verify/lib.mjs`：

```js
/* verify 腳本共用純函式：欄位形狀檢查、結果彙整、輸出格式。
   純函式走 vitest TDD（tests/verify-lib.test.ts）；fetchJson 為 I/O helper 不進單元測試。 */

function kindOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/** 驗物件欄位形狀。spec 值：'string'|'number'|'boolean'|'array'|'object'，尾綴 ? 表選填。 */
export function checkFields(obj, spec) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [`預期物件，得到 ${kindOf(obj)}`];
  }
  const errs = [];
  for (const [key, raw] of Object.entries(spec)) {
    const optional = raw.endsWith('?');
    const kind = optional ? raw.slice(0, -1) : raw;
    const v = obj[key];
    if (v === undefined) {
      if (!optional) errs.push(`缺欄位 ${key}`);
      continue;
    }
    const actual = kindOf(v);
    if (actual !== kind) errs.push(`欄位 ${key} 預期 ${kind}，得到 ${actual}`);
  }
  return errs;
}

export function summarize(results) {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { passed, failed, exitCode: failed > 0 ? 1 : 0 };
}

export function formatResults(results) {
  return results
    .map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`)
    .join('\n');
}

/** 原生 fetch + 逾時；非 2xx throw。契約檔用。 */
export async function fetchJson(url, init = {}, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
```

`scripts/verify/lib.d.mts`（比照 `scripts/demo/ffmpeg.d.mts` 先例，供 `tsc --noEmit` 檢查 test import）：

```ts
export interface CheckResult { name: string; ok: boolean; detail?: string }
export function checkFields(obj: unknown, spec: Record<string, string>): string[];
export function summarize(results: CheckResult[]): { passed: number; failed: number; exitCode: number };
export function formatResults(results: CheckResult[]): string;
export function fetchJson(url: string, init?: RequestInit, timeoutMs?: number): Promise<any>;
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/verify-lib.test.ts`
Expected: PASS（11 tests）

- [ ] **Step 5: 三綠燈不退步**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 0 errors；vitest 29 檔 143 tests 全綠（基線 28/132 + 本檔 11）

- [ ] **Step 6: Commit**

```bash
git add scripts/verify/lib.mjs scripts/verify/lib.d.mts tests/verify-lib.test.ts
git commit -m "feat(verify): 驗收腳本共用 lib 純函式（checkFields/summarize/formatResults，TDD）"
```

---

### Task 2: 契約 smoke runner + policy 契約檔 + 三骨架

**Files:**
- Create: `scripts/verify/contract.mjs`
- Create: `scripts/verify/contracts/policy.mjs`
- Create: `scripts/verify/contracts/dispatch.mjs`、`scripts/verify/contracts/epidemic.mjs`、`scripts/verify/contracts/alert.mjs`
- Modify: `package.json`（scripts 加 `verify:contract`）

**Interfaces:**
- Consumes: Task 1 的 `checkFields` / `summarize` / `formatResults` / `fetchJson`（自 `./lib.mjs`）。
- Produces:
  - CLI：`npm run verify:contract -- <policy|dispatch|epidemic|alert>`；退出碼 0＝全 PASS、1＝有 FAIL 或後端不通、2＝用法錯誤或契約待定。
  - 契約檔契約（協作者填實時遵循）：`export default { base: string, checks: {name: string, run(base): Promise<string|undefined>}[] }`，骨架態改為 `export default { pending: true, reason: string }`。

- [ ] **Step 1: 寫 runner**

`scripts/verify/contract.mjs`：

```js
#!/usr/bin/env node
/* 契約 smoke runner：npm run verify:contract -- <module>
   直打該模組後端 API 驗欄位形狀，秒級判定「後端契約變了」vs「前端接壞了」。
   契約檔在 contracts/<module>.mjs（契約即代碼：後端契約變更的 PR 必須同步更新，見 CONTRIBUTING §6）。 */
import { formatResults, summarize } from './lib.mjs';

const MODULES = ['policy', 'dispatch', 'epidemic', 'alert'];
const mod = process.argv[2];
if (!mod || !MODULES.includes(mod)) {
  console.error(`用法：npm run verify:contract -- <${MODULES.join('|')}>`);
  process.exit(2);
}

const def = (await import(`./contracts/${mod}.mjs`)).default;
if (def.pending) {
  console.error(`[${mod}] 契約待定：${def.reason}`);
  console.error(`後端契約定案的第一個 live PR 需填實 scripts/verify/contracts/${mod}.mjs 與 docs/collab/${mod}.md §4`);
  process.exit(2);
}

console.log(`[${mod}] 契約 smoke → ${def.base}`);
const results = [];
for (const c of def.checks) {
  try {
    const detail = await c.run(def.base);
    results.push({ name: c.name, ok: true, detail });
  } catch (e) {
    // Node fetch 連線被拒：單位址時 cause.code=ECONNREFUSED，多位址時包在 AggregateError.errors 裡
    const code = e?.cause?.code ?? e?.cause?.errors?.[0]?.code;
    const detail =
      code === 'ECONNREFUSED'
        ? `後端未啟動（${def.base} 連線被拒）——照 docs/collab/${mod}.md §2 起服務後重試`
        : e?.name === 'AbortError' || e?.name === 'TimeoutError'
          ? '逾時（5s 內無回應）'
          : String(e?.message ?? e);
    results.push({ name: c.name, ok: false, detail });
  }
}
console.log(formatResults(results));
const s = summarize(results);
console.log(`${s.passed} PASS / ${s.failed} FAIL`);
process.exit(s.exitCode);
```

- [ ] **Step 2: 寫 policy 契約檔（實作）**

`scripts/verify/contracts/policy.mjs`。端點與欄位以 `src/data/exchange/policy.ts` 現行呼叫為真相；
前端對 `source_name`/`chunk_count`/`enabled` 皆為防禦式讀取（`?? fallback`），故標選填。
`POST /api/chat`、`POST /api/report` 走 LLM（延遲不可期、有成本），不放 smoke——由
`verify:live` 與整合卡 §6 人眼清單覆蓋：

```js
/* policy（rag-agent）契約 smoke——端點以 src/data/exchange/policy.ts 現行呼叫為準。
   POST /api/chat、/api/report 為 LLM 呼叫（慢、有成本），不放 smoke，
   由 npm run verify:live -- policy 與 docs/collab/policy.md §6 覆蓋。 */
import { checkFields, fetchJson } from '../lib.mjs';

export default {
  base: process.env.VITE_POLICY_API ?? 'http://127.0.0.1:8100',
  checks: [
    {
      name: 'GET /api/sources 回陣列且欄位形狀正確',
      async run(base) {
        const rows = await fetchJson(`${base}/api/sources`);
        if (!Array.isArray(rows)) throw new Error(`預期 array，得到 ${typeof rows}`);
        if (rows.length === 0) return '0 筆（可接受：知識庫可為空）';
        const errs = checkFields(rows[0], {
          source_id: 'string',
          source_name: 'string?',
          source_type: 'string?',
          chunk_count: 'number?',
          enabled: 'boolean?',
        });
        if (errs.length) throw new Error(errs.join('；'));
        return `${rows.length} 個知識庫，首筆欄位齊`;
      },
    },
    {
      name: 'GET /api/report/templates 回陣列',
      async run(base) {
        const rows = await fetchJson(`${base}/api/report/templates`);
        if (!Array.isArray(rows)) throw new Error(`預期 array，得到 ${typeof rows}`);
        return `${rows.length} 個報告模版`;
      },
    },
  ],
};
```

- [ ] **Step 3: 寫三個骨架契約檔**

`scripts/verify/contracts/dispatch.mjs`（epidemic/alert 同形，僅換模組名與 port 註記）：

```js
/* dispatch 契約待定——後端 API 定案的第一個 live PR 必須把本檔填實（CONTRIBUTING §6）。
   填實時照 contracts/policy.mjs 的形狀：export default { base, checks }；
   base 讀 process.env.VITE_DISPATCH_API ?? 'http://127.0.0.1:8200'（port 分配見 docs/collab/README.md）。
   UI 需要的資訊參考 docs/collab/dispatch.md 附錄（前端 mock 欄位形狀）。 */
export default {
  pending: true,
  reason: '後端 API 契約尚未定案（見 docs/collab/dispatch.md §4）',
};
```

`epidemic.mjs`：註解中 env 為 `VITE_EPIDEMIC_API ?? 'http://127.0.0.1:8300'`、文件指向 `docs/collab/epidemic.md`。
`alert.mjs`：env 為 `VITE_ALERT_API ?? 'http://127.0.0.1:8400'`、文件指向 `docs/collab/alert.md`。

- [ ] **Step 4: package.json 加 script**

`package.json` scripts 段加一行（保持既有排序風格，加在 `"test"` 之後）：

```json
"verify:contract": "node scripts/verify/contract.mjs"
```

- [ ] **Step 5: 驗證三條路徑**

```bash
npm run verify:contract -- dispatch; echo "exit=$?"
```
Expected: stderr 顯示「[dispatch] 契約待定：後端 API 契約尚未定案…」+「需填實 scripts/verify/contracts/dispatch.mjs…」，`exit=2`

```bash
npm run verify:contract -- nosuch; echo "exit=$?"
```
Expected: 用法訊息，`exit=2`

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:8100/api/sources || echo DOWN
```
- 若 DOWN（rag-agent 未起）：`npm run verify:contract -- policy; echo "exit=$?"` → 兩項 FAIL、detail 為「後端未啟動（http://127.0.0.1:8100 連線被拒）——照 docs/collab/policy.md §2 起服務後重試」（非 stack trace）、`exit=1`。**如實記錄「live 成功路徑未驗，留待使用者起 rag-agent 後補驗」。**
- 若 200：`npm run verify:contract -- policy; echo "exit=$?"` → 兩項 PASS、`exit=0`。

- [ ] **Step 6: 三綠燈不退步**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全綠（本 task 未動 src/、未加測試，維持 Task 1 後的數字）

- [ ] **Step 7: Commit**

```bash
git add scripts/verify/contract.mjs scripts/verify/contracts/ package.json
git commit -m "feat(verify): 契約 smoke runner + policy 契約檔（實作）+ dispatch/epidemic/alert 骨架"
```

---

### Task 3: Playwright live 驗收 runner + policy 斷言檔 + 三骨架

**Files:**
- Create: `scripts/verify/live.mjs`
- Create: `scripts/verify/live/policy.mjs`
- Create: `scripts/verify/live/dispatch.mjs`、`scripts/verify/live/epidemic.mjs`、`scripts/verify/live/alert.mjs`
- Modify: `package.json`（scripts 加 `verify:live`）

**Interfaces:**
- Consumes: Task 1 的 `summarize` / `formatResults`；playwright `chromium`（既有 devDependency）。
- Produces:
  - CLI：`npm run verify:live -- <policy|dispatch|epidemic|alert>`；退出碼同 contract runner（0/1/2）。
  - 斷言檔契約：`export default { id: string, asserts(page): Promise<{name, ok, detail?}[]> }`，骨架態 `{ pending: true, reason: string }`。
  - 截圖輸出至 OS tmpdir：`imarine-verify-live-<module>.png`（不進 repo、不進 scratch 依賴）。

- [ ] **Step 1: 寫 runner**

`scripts/verify/live.mjs`（spawn/waitOn/SIGTERM 手法比照 `scripts/demo/recorder.mjs`——直 spawn vite 執行檔不經 npx，SIGTERM 才殺得到真 dev server 不留孤兒進程）：

```js
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
```

- [ ] **Step 2: 寫 policy 斷言檔（實作）**

policy 頁為既有特例**不顯示資料源 chip**（README 協作者指南 §4、`src/ui/components.ts:15`），
live 特徵改用「綜合對話總覽卡」文案：進頁預設鎖定綜合對話（`src/screens/policy/index.ts`
`select('global')`），`loadGlobalSources()` 打 `/api/sources` 成功 → 文案「已接入 N 個知識庫」；
失敗 fallback → 「已就緒 N 條情報」。

`scripts/verify/live/policy.mjs`：

```js
/* policy live 斷言——policy 頁不顯資料源 chip（既有特例），
   以綜合對話總覽卡 live 文案（「已接入 N 個知識庫」）為 live 特徵；
   fallback 文案為「已就緒 N 條情報」（rag-agent 未啟動）。 */
export default {
  id: 'policy',
  async asserts(page) {
    const results = [];
    const thread = page.locator('#s-policy #thread');
    await thread.waitFor({ timeout: 10000 });

    let live = false;
    try {
      await page.waitForFunction(
        () => document.querySelector('#s-policy #thread')?.textContent?.includes('已接入'),
        null,
        { timeout: 10000 },
      );
      live = true;
    } catch {
      /* 逾時＝停在 fallback 文案 */
    }
    const text = (await thread.textContent()) ?? '';
    results.push({
      name: '綜合對話總覽卡為 live 文案（已接入 N 個知識庫）',
      ok: live,
      detail: live
        ? undefined
        : `實際文案開頭：「${text.trim().slice(0, 40)}…」（含「已就緒」＝mock fallback，rag-agent 未啟動）`,
    });

    const srcCount = Number((await page.locator('#s-policy #srcCount').textContent()) ?? '0');
    results.push({ name: '右欄來源計數 > 0', ok: srcCount > 0, detail: `srcCount=${srcCount}` });

    return results;
  },
};
```

- [ ] **Step 3: 寫三個骨架斷言檔**

`scripts/verify/live/dispatch.mjs`（epidemic/alert 同形，換模組名）：

```js
/* dispatch live 斷言待定——後端契約定案的第一個 live PR 必須把本檔填實（CONTRIBUTING §6）。
   填實時照 live/policy.mjs 的形狀：export default { id, asserts(page) }。
   dispatch/epidemic/alert 頁有資料源 chip（policy 是特例沒有），標配斷言至少含：
   1) #s-<模組> .src.live 存在（chip 轉 LIVE）；2) KPI 統計列數字非空；3) 主視覺容器非空。
   epidemic 填實注意：Mapbox GL 為 WebGL，runner 已帶 --use-angle=swiftshader（勿加 --disable-gpu），
   且需 .env 的 VITE_MAPBOX_TOKEN。 */
export default {
  pending: true,
  reason: '後端 API 契約尚未定案（見 docs/collab/dispatch.md §4/§6）',
};
```

- [ ] **Step 4: package.json 加 script**

scripts 段 `"verify:contract"` 之後加：

```json
"verify:live": "node scripts/verify/live.mjs"
```

- [ ] **Step 5: 驗證三條路徑 + port 無殘留**

```bash
npm run verify:live -- alert; echo "exit=$?"
```
Expected: 「[alert] 契約待定…」，`exit=2`，**未起 dev server**（骨架短路在 spawn 之前）

```bash
npm run verify:live -- policy; echo "exit=$?"; sleep 1; lsof -ti tcp:5320 || echo "port clean"
```
- rag-agent 未起：第一項斷言 FAIL（detail 帶「已就緒…mock fallback」）、`srcCount>0` PASS（fallback 也有 mock 聯集來源）、零 pageerror PASS、`exit=1`、截圖產生於 tmpdir、`port clean`。**如實記錄 live 成功路徑留待使用者補驗。**
- rag-agent 有起：全 PASS、`exit=0`、`port clean`。

檢查使用者既有服務未受擾：`lsof -ti tcp:5173 >/dev/null 2>&1; echo "5173 未被本腳本動過（有無輸出皆與跑前一致即可）"`

- [ ] **Step 6: 三綠燈不退步**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全綠

- [ ] **Step 7: Commit**

```bash
git add scripts/verify/live.mjs scripts/verify/live/ package.json
git commit -m "feat(verify): Playwright live 驗收 runner + policy 斷言檔（實作）+ 三骨架"
```

---

### Task 4: GitHub Actions CI + PR 模板 + `npm run check`

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/pull_request_template.md`
- Modify: `package.json`（scripts 加 `check`）

**Interfaces:**
- Consumes: 既有 `test`/`build` scripts；Task 2/3 的 `verify:contract`/`verify:live`（PR 模板引用其指令名）。
- Produces: `npm run check`（CONTRIBUTING §6 與 CI 共用的三綠燈序列）；CI workflow 名 `CI`、job 名 `check`（使用者設 branch protection 時指定的 required check 名）。

- [ ] **Step 1: 寫 ci.yml**

`.github/workflows/ci.yml`：

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run test
      - run: npm run build
```

- [ ] **Step 2: 寫 PR 模板**

`.github/pull_request_template.md`：

```markdown
## 模組

<!-- 這個 PR 屬於哪個模組：policy / dispatch / epidemic / alert -->

## 改了什麼

<!-- 3-5 行摘要；若改了 src/data/types.ts，逐一列出動到的型別 -->

## 改動範圍自查（CONTRIBUTING §3 白名單）

- [ ] 只動了自己模組的 provider（`src/data/exchange/<模組>.ts`）
- [ ] 只動了自己模組的 screen（`src/screens/<模組>/`）與 settings section
- [ ] `src/data/types.ts` 只動自己模組的型別區塊（若有，已在上方列出）
- [ ] 沒動禁改清單（`src/shell/`、`src/ui/`、`src/main.ts`、`index.html`、其他模組、`package.json`、`.github/`、`scripts/demo/`、`CLAUDE.md`/`HANDOFF.md`）

## 契約變更

- [ ] 無
- [ ] 有 —— `docs/collab/<模組>.md` §4 與 `scripts/verify/contracts/<模組>.mjs` 已同步更新（含 §8 變更紀錄）

## 測試證據

- [ ] `npm run check` 三綠燈（貼上尾段輸出）
- [ ] `npm run verify:contract -- <模組>` 結果（或勾此項並說明不適用原因：＿＿）
- [ ] `npm run verify:live -- <模組>` 結果（或勾此項並說明不適用原因：＿＿）

## 頁面截圖

<!-- 改動頁面的截圖（verify:live 產出的 tmpdir 截圖亦可） -->
```

- [ ] **Step 3: package.json 加 check script**

scripts 段 `"test"` 之前加（讓協作者本地一鍵跑 CI 同款）：

```json
"check": "tsc --noEmit && vitest run && vite build"
```

- [ ] **Step 4: 驗證**

Run: `npm run check`
Expected: 三段依序全綠（tsc 無輸出、vitest 29 檔 143 tests、build 完成）；退出碼 0

Run: `npx tsc --noEmit; node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); console.log(y.includes('node-version: 22')?'yml ok':'yml missing node 22')"`
Expected: `yml ok`

- [ ] **Step 5: Commit**

```bash
git add .github/ package.json
git commit -m "ci: GitHub Actions 三綠燈把關 + PR 自查模板 + npm run check"
```

---

### Task 5: docs/collab/ 整合卡五件

**Files:**
- Create: `docs/collab/README.md`
- Create: `docs/collab/_template.md`
- Create: `docs/collab/policy.md`
- Create: `docs/collab/dispatch.md`、`docs/collab/epidemic.md`、`docs/collab/alert.md`

**Interfaces:**
- Consumes: Task 2/3 的指令名（`verify:contract`/`verify:live`）與契約/斷言檔路徑。
- Produces: 整合卡八欄結構（CONTRIBUTING §2/§6 連結目標）；port/env 分配總表（唯一權威）。

- [ ] **Step 1: 寫 README.md（索引 + 分配總表 + 維護者驗 PR 流程）**

`docs/collab/README.md`：

```markdown
# docs/collab —— 模組整合卡

每個接後端的模組一張整合卡（後端 repo、起服務、API 契約、驗收），**契約變更隨 PR 一起改卡**，
本目錄就是前後端資訊銜接的單一真相來源。協作流程與 PR 規範見根目錄 `CONTRIBUTING.md`。

## Port 與 env 變數分配總表（唯一權威，新後端先來認領）

| 模組 | 後端 repo | port | 前端 env 變數 | 整合卡 |
|---|---|---|---|---|
| carbon | iMarine-Carbon-Tokenization-POC | 8000（+8545 chain） | `VITE_CARBON_API` | 既有，見根 README「Live Demo 前置作業」，不另立卡 |
| policy | rag-agent | 8100 | `VITE_POLICY_API` | [policy.md](policy.md) |
| dispatch | 待協作者填 | **8200** | `VITE_DISPATCH_API` | [dispatch.md](dispatch.md) |
| epidemic | 待協作者填 | **8300** | `VITE_EPIDEMIC_API` | [epidemic.md](epidemic.md) |
| alert | 待協作者填 | **8400** | `VITE_ALERT_API` | [alert.md](alert.md) |

Port 慣例：每模組一個百位段，輔助服務用同段 +1～+99（carbon 的 8545 chain 為既成事實，
新模組不重蹈跨段）。twin 原生內建無後端、agent 直連 Gemini API，皆不佔 port 段。

## 維護者驗 PR 流程（協作者也看得到自己會被怎麼驗）

1. CI 綠（tsc + vitest + build，PR 頁面自動跑）
2. 照該模組整合卡 §2 起後端
3. `npm run verify:contract -- <模組>` —— 契約 smoke，判定後端形狀
4. `npm run verify:live -- <模組>` —— 頁面真渲染 + chip 轉 LIVE + 零 pageerror
5. 人眼看頁面（整合卡 §6 清單）
6. 合併
```

- [ ] **Step 2: 寫 _template.md（八欄模板）**

`docs/collab/_template.md`：

```markdown
# <模組名> 整合卡

<!-- 複製本檔為 <模組>.md 後逐節填寫；「後端 API 為準」：§4 由後端負責人維護、契約變更隨 PR 更新 -->

## 1. 基本資訊

| 項目 | 值 |
|---|---|
| 模組 | <id>（screen：`src/screens/<id>/`） |
| 後端負責人 | 待填 |
| 後端 repo | 待填（URL） |
| 預設 branch | 待填 |

## 2. 起服務

前置需求（語言版本、套件管理器）：待填

```
# 指令序（維護者照抄可起）
待填
```

健康檢查：`curl http://127.0.0.1:<port>/<health-path>` → 預期輸出：待填

## 3. env 變數

| 側 | 變數 | 說明 | 預設 |
|---|---|---|---|
| 前端 | `VITE_<模組>_API` | 後端位址（見 docs/collab/README.md 分配表） | `http://127.0.0.1:<port>` |
| 後端 | 待填 | | |

## 4. API 契約（後端為準，隨 PR 更新）

| Method | Path | 用途 |
|---|---|---|
| 待填 | | |

<!-- 每個端點附 request/response JSON 範例 + 欄位說明 + 錯誤回應形狀 -->

## 5. 前端接線

- provider：`src/data/exchange/<模組>.ts`（目前 mock；接 live 時在 provider 內轉換成 snapshot 形狀，UI 不動）
- fallback：live 失敗必退 mock（比照 `src/data/exchange/policy.ts`，demo 現場後端沒起也不能崩）
- 資料源 chip 轉 LIVE 條件：待填

## 6. 驗收

- `npm run verify:contract -- <模組>`
- `npm run verify:live -- <模組>`
- 人眼清單：待填（頁面該看到什麼）

## 7. demo 影片

- scenario：`<模組>`（見根 README「簡報 Demo 影片錄製」）
- 重錄：`npm run demo:record -- <模組>`（接上 live 後重錄，chip 自動轉 LIVE）

## 8. 變更紀錄

| 日期 | 變更 |
|---|---|
| | |
```

- [ ] **Step 3: 寫 policy.md（填實）**

`docs/collab/policy.md`——§4 端點與形狀自 `src/data/exchange/policy.ts` 現行呼叫整理
（前端防禦式讀取的欄位標「選填」）；§2 起服務 repo 內無資訊（根 README 明寫「請洽負責該
後端的協作者」），如實標待填：

```markdown
# policy（AI 政策輔助報告）整合卡

## 1. 基本資訊

| 項目 | 值 |
|---|---|
| 模組 | policy（screen：`src/screens/policy/`） |
| 後端負責人 | 待填（rag-agent 協作者） |
| 後端 repo | 待填（URL；根 README 記載「rag-agent 的取得與啟動請洽負責該後端的協作者」） |
| 預設 branch | 待填 |

## 2. 起服務

待後端負責人填（前置需求、指令序、健康檢查端點）。現況：服務起在 `http://127.0.0.1:8100`。

## 3. env 變數

| 側 | 變數 | 說明 | 預設 |
|---|---|---|---|
| 前端 | `VITE_POLICY_API` | rag-agent 位址 | `http://127.0.0.1:8100` |
| 後端 | 待填 | | |

## 4. API 契約（後端為準；下表為前端 `src/data/exchange/policy.ts` 現行實際呼叫）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/sources` | 知識庫清單（右欄來源、settings 知識庫管理） |
| GET | `/api/report/templates` | 報告模版清單 |
| POST | `/api/chat` | 綜合對話（附引用回答） |
| POST | `/api/report` | 產生結構化報告 |

### GET /api/sources → 200

```json
[
  { "source_id": "s1", "source_name": "航港法規庫", "source_type": "regulation", "chunk_count": 120, "enabled": true }
]
```

- `source_id`: string（必填）
- `source_name`: string（選填，缺時前端以 source_id 代）
- `source_type`: string（選填；已知值 `regulation`/`news`/`alt_energy`/`uploaded`，前端映射五類分類標籤，未知值原樣顯示）
- `chunk_count`: number（選填，缺時前端視為 0）
- `enabled`: boolean（選填，缺時前端視為 true）

### POST /api/chat

request：`{ "message": string, "history": PolicyChatMsg[] }`（`PolicyChatMsg` 形狀見 `src/data/types.ts`；前端送最近 8 則）

response 200：

```json
{
  "answer": "回答文字，可含 [ev_xxx] 引用標記",
  "evidence_package": { "evidence_items": [ { "evidence_id": "ev_1", "title": "…", "source_id": "s1", "source_type": "regulation", "locator": { "article": "第 12 條" }, "published_at": "2025-01-01" } ] },
  "citation_coverage": 0.87,
  "provider": "…",
  "model": "…"
}
```

- `answer` 內的 `[ev_xxx]` 由前端轉成 cite span，`evidence_items` 映射右欄來源
- `citation_coverage`: 0–1（前端 ×100 顯示為 Grounding %）
- 各欄位皆為前端防禦式讀取（缺欄不炸，顯示降級）

### GET /api/report/templates → 200

模版物件陣列（前端原樣餵給模版下拉，形狀由後端定義並在此記錄）。

### POST /api/report

request：`{ "prompt": string, "source_ids": string[], "template": string }`

response 200：`{ "report_id", "topic", "template_id", "sections": [{ "key", "label", "text", "citations" }], "source_list": [{ "evidence_id", "source_id", "source_name", "locator", "date" }], "citation_coverage", "provider", "model" }`（`sections[].text` 可含 `[ev_xxx]`，以 `source_list` 順序編號對齊）

### 錯誤形狀

非 2xx 時前端 throw 並由呼叫端 fallback 回 mock 示範；錯誤 body 形狀待後端負責人補記。

## 5. 前端接線

- provider：`src/data/exchange/policy.ts`（live；`snapshot()` 仍回 mock 收件匣——那是 demo 展示，後端無「情報收件匣」概念）
- fallback：呼叫端 try/catch，後端不在退回 mock 情報聯集／罐頭訊息（`src/screens/policy/index.ts`、`src/screens/settings/sections/policy-kb-mock.ts`）
- live 特徵：policy 頁不顯資料源 chip（既有特例）；綜合對話總覽卡文案「已接入 N 個知識庫」＝live、「已就緒 N 條情報」＝fallback

## 6. 驗收

- `npm run verify:contract -- policy`（GET /api/sources、/api/report/templates 形狀；chat/report 為 LLM 呼叫不放 smoke）
- `npm run verify:live -- policy`（總覽卡 live 文案 + srcCount>0 + 零 pageerror）
- 人眼：綜合對話提問一次，回答附引用編號、右欄來源連動、Grounding 值合理；產報告流程能出報告

## 7. demo 影片

- scenario：`policy`；重錄 `npm run demo:record -- policy`（目前為 mock 態錄製，live 後端接上後重錄自動轉 LIVE chip）

## 8. 變更紀錄

| 日期 | 變更 |
|---|---|
| 2026-07-12 | 初版：自 `src/data/exchange/policy.ts` 現行呼叫整理 §4；§2 待後端負責人填 |
```

- [ ] **Step 4: 寫三張骨架卡**

`docs/collab/dispatch.md`（epidemic/alert 同構，替換：模組名、port、env 變數、附錄 mock 形狀）。
自 `_template.md` 複製後：§1–§3 填已知值（port 8200、`VITE_DISPATCH_API`）、§4 標「契約待定——
後端定案的第一個 live PR 填實本節 + `scripts/verify/contracts/dispatch.mjs`」、§7 scenario 名
`dispatch`，並在檔尾加附錄：

dispatch.md 附錄：

```markdown
## 附錄：前端現有 mock 欄位形狀（參考，非契約承諾）

「後端 API 為準」之下，本附錄是前端讓後端知道 UI 需要哪些資訊的參考。
來源：`src/data/mock/dispatch.json`（完整值請直接看檔）。

- `scenarios[]`（3 筆）：`{ id, label, nowcast, conclusion, cwa, ops, cards, metrics }`
```

epidemic.md 附錄：

```markdown
- `timeRange`：`{ startDate, endDate, startDay, now }`
- `pipeline[]`（5 筆）：`{ key, label, count, detail }`
- `fleet[]`（5 筆）：`{ id, name, factors, ports, events, intel, advice, sms }`
- `inflowPool[]`（2 筆）：`{ kind, targetId, event, factors, intel, toast }`
```

alert.md 附錄：

```markdown
- `kpi`：`{ published, reachedPeople, reachedShips, avgSec, deliveryRate }`
- `cells[]`（9 筆）：`{ id, lngLat, delivered }`
- `feed[]`（6 筆）：`{ id, cat, sev, source, title, body, time, ch, lngLat, fence, cellsLit, funnels, trace, sms, acked }`
- `drillPool[]`（2 筆）：同 `feed[]` 形狀
```

epidemic.md §6 另加一行注意：「Mapbox GL 需 `.env` 的 `VITE_MAPBOX_TOKEN`；headless 驗收
runner 已帶 `--use-angle=swiftshader`（勿加 `--disable-gpu`）」。

- [ ] **Step 5: 驗證連結與一致性**

```bash
ls docs/collab/  # 六檔齊：README.md _template.md policy.md dispatch.md epidemic.md alert.md
grep -l "8200" docs/collab/dispatch.md && grep -l "8300" docs/collab/epidemic.md && grep -l "8400" docs/collab/alert.md
grep -c "待填\|待定" docs/collab/policy.md  # 只允許出現在 §1/§2/§3 後端側/錯誤形狀/負責人（人工確認位置合理）
```
Expected: 六檔存在、port 對表、policy.md 的待填項僅限後端負責人才知道的資訊

- [ ] **Step 6: Commit**

```bash
git add docs/collab/
git commit -m "docs(collab): 整合卡五件——分配總表/模板/policy 填實 + dispatch/epidemic/alert 骨架"
```

---

### Task 6: CONTRIBUTING.md + 配套接線（README/CLAUDE.md/.env.example）

**Files:**
- Create: `CONTRIBUTING.md`
- Modify: `README.md`（環境變數表 + 協作者指南開頭）
- Modify: `CLAUDE.md`（開頭 blockquote 加一行）
- Modify: `.env.example`（加三變數）

**Interfaces:**
- Consumes: Task 2/3/4/5 全部產出（指令名、整合卡路徑、PR 模板、白名單路徑）。
- Produces: 協作者單一入口文件；`README.md`/`CLAUDE.md` 導引線。

- [ ] **Step 1: 寫 CONTRIBUTING.md**

完整內容（八節；規範性內容如下，銜接語句可潤飾但規則不得增減）：

```markdown
# CONTRIBUTING —— 協作者指南（人與 AI 助手皆適用）

> 你是協作者（或協作者的 AI coding 助手）：本文件是從 clone 到發 PR 的唯一入口，
> 規則以本文件為準。repo 根目錄的 `CLAUDE.md` 是 repo 擁有者的個人工作規則，
> 協作情境**不適用**於你。技術規範細節（settings schema、storage、mock→live、
> 頁面設計規範）見根 README「協作者指南」章節，本文件負責流程與範圍。

## 1. 專案脈絡 30 秒

Vite + vanilla TS 的 shell 應用：9 個 screen（hero + 6 功能頁 + agent + settings）掛在
左側 rail，`src/shell/registry.ts` 註冊、hash 路由 `#/<id>`。每個功能模組一個資料
provider（`src/data/exchange/<模組>.ts`，介面 `Provider<T>`、`source: 'live' | 'mock'`），
screen 只呼叫 `ctx.data.<模組>.snapshot()`，不知道背後是 mock 還是 live。
**你的工作範圍＝你負責的那個模組**：provider 接你的後端、該頁呈現微調、該模組 settings 欄位。

## 2. 環境建置

1. Node 22（維護者本機與 CI 皆為 22）
2. `npm i`
3. `cp .env.example .env`（你的模組的 API 位址變數見 `docs/collab/README.md` 分配總表）
4. `npm run dev` → http://localhost:5173
5. 起你自己的後端：見 `docs/collab/<你的模組>.md` §2

## 3. 改動範圍白名單

每個模組的 PR **只准動**以下路徑（`<模組>` 換成你的模組 id）：

- `src/data/exchange/<模組>.ts` —— provider，mock→live 的主戰場
- `src/screens/<模組>/` —— 自己頁面的呈現
- `src/screens/settings/sections/<模組>.ts` —— 自己模組的設定欄位
- `src/data/types.ts` —— 僅自己模組的型別區塊；PR 描述必須逐一列出動到的型別
- `src/data/mock/<模組>.json` —— 契約造成 mock 形狀連動時
- `docs/collab/<模組>.md` —— 整合卡；契約變更必須同 PR 更新（含 §8 變更紀錄）
- `scripts/verify/contracts/<模組>.mjs`、`scripts/verify/live/<模組>.mjs` —— 契約即代碼，同上必須同步
- `tests/` 內自己模組的測試檔

**禁改清單**（要動請先開 issue 討論，不要直接進 PR）：

- `src/shell/`、`src/ui/`、`src/main.ts`、`index.html`
- 其他模組的任何檔案
- `package.json`（含依賴與 scripts）、`package-lock.json`
- `.github/`（CI 與 PR 模板）
- `scripts/demo/`（簡報錄影管線）
- `CLAUDE.md`、`HANDOFF.md`（擁有者工作檔）

白名單是軟約束（PR 模板自查 + review 把關，CI 不硬擋）；超出白名單的 PR 會被要求拆分或退回。

## 4. 資料交換層規則

- **後端 API 為準**：契約寫在 `docs/collab/<模組>.md` §4，由你（後端負責人）維護。
- provider 內把後端回應**轉換**成 UI 需要的 snapshot 形狀（參考 `src/data/exchange/policy.ts`
  的映射寫法），screen 程式碼不動。
- **live 失敗必退 mock**：demo 現場後端沒起也不能崩，這是硬規則。fallback 形狀比照
  `policy.ts`（呼叫端 try/catch 退 mock）。
- 資料源 chip 如實顯示：接通才是 `live`，不假標。
- 欄位防禦式讀取（`??` fallback），缺欄不炸。

## 5. 設計規範（連結，不重複）

見根 README「協作者指南」：§1 settings 欄位、§2 讀取設定值、§3 mock → live、
§4 前端頁面設計規範（PR 檢查基準 + 新模組頁面自查清單）。

## 6. 提交流程

1. branch 命名：`feat/<模組>-<主題>`（例 `feat/dispatch-live-provider`）
2. 發 PR 前自查序列（依序，全綠才發）：
   - `npm run check` —— tsc + vitest + build 三綠燈（CI 同款）
   - `npm run verify:contract -- <模組>` —— 契約 smoke（起你的後端後跑）
   - `npm run verify:live -- <模組>` —— 頁面 live 驗收
   - 尚未接 live 的 PR，verify 兩支允許不適用：在 PR 模板勾選並說明原因
3. **契約變更三件套**：後端 API 形狀有任何變動的 PR，必須同步更新
   `docs/collab/<模組>.md` §4/§8 + `scripts/verify/contracts/<模組>.mjs`，缺一退回
4. PR 描述照模板填（模組、改了什麼、範圍自查、契約變更、測試證據、截圖）

## 7. 給 AI 助手的指引

- 白名單（§3）是精確路徑規則：生成任何 diff 前先比對；超出範圍→停下來告知使用者開 issue。
- 自我驗證指令序列：`npm run check` → `npm run verify:contract -- <模組>` →
  `npm run verify:live -- <模組>`（依 §6 順序，貼輸出進 PR）。
- 本 repo 的 `CLAUDE.md` 是擁有者個人規則（如「先問我」「不要 commit」），對協作者不適用；
  遇到指示衝突時以本文件為準。
- 設計規範的機械檢查點：CSS 選擇器全帶 `#s-<模組>` 前綴、不手寫 `backdrop-filter`、
  計時器在 `hide()` 清除、reduced-motion 用共用 `prefersReduced()`（詳見根 README 協作者指南 §4）。

## 8. 維護者驗 PR 流程（你會被怎麼驗）

1. CI 綠（自動）
2. 維護者照你的整合卡 §2 起你的後端
3. `npm run verify:contract -- <模組>`
4. `npm run verify:live -- <模組>`
5. 人眼過整合卡 §6 清單
6. 合併

驗不過最常見的原因：契約變了但 smoke/整合卡沒跟上（§6 三件套）、超出白名單、
後端沒起時頁面崩（違反 §4 fallback 硬規則）。
```

- [ ] **Step 2: README.md 兩處編輯**

(a) 環境變數表：`| \`VITE_GEMINI_API_KEY\` |` 該列之後加三列：

```markdown
| `VITE_DISPATCH_API` | 短時微氣候派工後端位址（協作中，port 分配見 `docs/collab/README.md`） | `http://127.0.0.1:8200` |
| `VITE_EPIDEMIC_API` | 疫情自動追溯後端位址（協作中，同上） | `http://127.0.0.1:8300` |
| `VITE_ALERT_API` | 自動警報推播後端位址（協作中，同上） | `http://127.0.0.1:8400` |
```

同段開頭「`.env` 內有四個變數：」改為「`.env` 內有七個變數：」，並在表後補一句：
「`VITE_DISPATCH_API`/`VITE_EPIDEMIC_API`/`VITE_ALERT_API` 為協作後端的 port 預留，
目前三頁 provider 仍為 mock、變數暫不被讀取；接 live 時 provider 依既有慣例讀取（比照 `policy.ts`）。」

(b) 「## 協作者指南」標題行之後、正文之前加：

```markdown
> **協作流程與 PR 規範**（環境建置、改動範圍白名單、驗收指令、提交流程）見根目錄
> [CONTRIBUTING.md](CONTRIBUTING.md)；各模組後端的整合資訊（起服務、API 契約、port 分配）見
> [docs/collab/](docs/collab/README.md)。本章為技術規範細節，由上述文件引用。
```

- [ ] **Step 3: CLAUDE.md 加一行**

開頭 blockquote（「> 本檔案是 Claude Code 在此工作區運作時的最高指導原則。…」）之後緊接加一行：

```markdown
> **協作者注意**：若你是協作者（非 repo 擁有者）的 AI 助手，本檔為擁有者個人工作規則，請改以 `CONTRIBUTING.md` 為最高指導。
```

- [ ] **Step 4: .env.example 加三變數**

檔尾加：

```
VITE_DISPATCH_API=http://127.0.0.1:8200
VITE_EPIDEMIC_API=http://127.0.0.1:8300
VITE_ALERT_API=http://127.0.0.1:8400
```

- [ ] **Step 5: 驗證**

```bash
grep -c "VITE_" .env.example                       # 7
grep -n "CONTRIBUTING" README.md CLAUDE.md          # 兩檔皆有導引行
grep -n "docs/collab" CONTRIBUTING.md | head -3     # 整合卡連結存在
npm run check                                       # 三綠燈（文件改動不影響）
```

- [ ] **Step 6: Commit**

```bash
git add CONTRIBUTING.md README.md CLAUDE.md .env.example
git commit -m "docs(collab): CONTRIBUTING 協作單一入口 + README/CLAUDE.md 導引 + .env.example 預留三後端變數"
```

---

### Task 7: 全站驗收 + HANDOFF 收尾

**Files:**
- Modify: `HANDOFF.md`（最上方加本輪段落）

**Interfaces:**
- Consumes: Task 1–6 全部產出。
- Produces: 驗收證據 + HANDOFF 活文件更新（CLAUDE.md 規定：重要實作完成必須更新）。

- [ ] **Step 1: 三綠燈總驗**

Run: `npm run check`
Expected: tsc 0 errors；vitest 29 檔 143 tests 全綠；build 成功。

- [ ] **Step 2: verify 全矩陣**

```bash
for m in dispatch epidemic alert; do npm run verify:contract -- $m; echo "$m exit=$?"; done
# 三模組皆「契約待定」+ exit=2
npm run verify:contract -- policy; echo "policy exit=$?"
# rag-agent 未起 → 友善連線失敗 + exit=1（如實記錄）；有起 → 全 PASS + exit=0
npm run verify:live -- alert; echo "exit=$?"          # 契約待定 exit=2、不起 dev server
npm run verify:live -- policy; echo "exit=$?"
sleep 1; lsof -ti tcp:5320 || echo "port clean"       # 無殘留
```

- [ ] **Step 3: 文件互鏈全檢**

```bash
# CONTRIBUTING/整合卡/PR 模板引用的指令與路徑都真實存在
grep -o "verify:[a-z]*" CONTRIBUTING.md .github/pull_request_template.md | sort -u   # verify:contract, verify:live
node -e "const p=require('./package.json').scripts; ['check','verify:contract','verify:live'].forEach(k=>{if(!p[k])throw new Error(k+' missing')}); console.log('scripts ok')"
ls docs/collab/{README,_template,policy,dispatch,epidemic,alert}.md
ls scripts/verify/{lib,contract,live}.mjs scripts/verify/contracts/*.mjs scripts/verify/live/*.mjs
```
Expected: 全部存在、無指向不存在檔案的引用。

- [ ] **Step 4: 新協作者自查演練（spec 驗收標準 6）**

以「dispatch 後端協作者第一天」視角走一遍：只讀 CONTRIBUTING.md + docs/collab/dispatch.md，
確認以下每一步都有明確指示且指令可執行：clone → 環境建置（§2）→ 知道自己能動哪些檔（§3）→
知道契約寫哪裡（整合卡 §4 + contracts/dispatch.mjs）→ 知道發 PR 前跑什麼（§6）→
知道會被怎麼驗（§8）。有斷點就回頭補文件（補完重跑本步驟）。

- [ ] **Step 5: 更新 HANDOFF.md**

最上方「最後更新」段改寫，並在「## 1. 目前狀態」最上方加本輪段落，內容涵蓋：
方案 B 四件套落地清單（檔案路徑）、三綠燈數字、verify 矩陣結果（含 policy live 是否實測的
誠實分野）、待使用者手動步驟（push 後看 CI 首跑綠、GitHub 設 branch protection required
check=CI/check、rag-agent 可起時補驗 `verify:contract/live -- policy` 成功路徑、
通知協作者 CONTRIBUTING 上線）、殘留（三模組契約待定為設計內狀態非缺陷）。
spec/plan 路徑：`docs/superpowers/specs/2026-07-12-collab-workflow-design.md`、
`docs/superpowers/plans/2026-07-12-collab-workflow.md`。

- [ ] **Step 6: Commit**

```bash
git add HANDOFF.md
git commit -m "docs(handoff): 協作流程優化輪收尾——四件套落地 + 驗收矩陣 + 使用者手動步驟"
```

---

## Plan Self-Review（已執行）

1. **Spec coverage**：spec §3 檔案清單 ↔ Task 1–6 檔案逐一對應；§4 CONTRIBUTING 八節 ↔ Task 6 Step 1；§5 整合卡 ↔ Task 5；§6 CI ↔ Task 4；§7 雙層腳本 ↔ Task 1–3；§8 驗收標準 1–6 ↔ Task 7（標準 7 為使用者手動步驟，記入 HANDOFF）。無缺口。
2. **Placeholder scan**：計畫內「待填」僅出現在交付文件的內容裡（整合卡骨架的設計內狀態），非計畫步驟的空缺；所有程式碼步驟含完整程式碼。
3. **Type consistency**：`checkFields/summarize/formatResults/fetchJson` 簽名在 Task 1 Interfaces 定義、Task 2/3 引用一致；契約檔 `{base, checks}`/`{pending, reason}` 與斷言檔 `{id, asserts}`/`{pending, reason}` 兩處 runner 的判斷欄位一致；npm script 名三處（package.json/CONTRIBUTING/PR 模板）一致。

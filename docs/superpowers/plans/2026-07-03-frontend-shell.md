# iMarine-FrontEnd Shell 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Vite + vanilla TS 的 shell：hero 兩段式 + 6 功能頁 + 左側 rail + 資料交換層（carbon/twin live、其餘 mock），視覺與互動對齊已驗收的 `docs/preview/preview-v3.html`。

**Architecture:** hash 路由 lazy 載入各 screen 模組（`mount` 一次 + `show/hide` 快取切換，DOM 不銷毀——twin iframe 因此離開不重載）；三層背景系統（點雲 canvas + 光暈 + veil 罩幕）依 `body[data-mode]` 切換；資料經 `Provider` 介面注入，UI 依 `source` 顯示 live/mock chip。

**Tech Stack:** Vite 5、TypeScript（無框架）、Liquid Glass Kit（vanilla，複製兩檔）、Vitest + jsdom（邏輯層測試）。

## Global Constraints

- **禁止 emoji**（所有檔案，含註解與文案）。
- **Claude 不執行 `git commit` / `git push`**——每個 task 結尾為「檢查點」步驟：驗證 + 更新 `HANDOFF.md` 進度一行，由使用者自行 commit。
- 文件與 UI 文案：繁體中文 + 英文術語。
- 玻璃樣式一律用 Kit 的 class 與 API，**不手寫 `backdrop-filter`**；小型/大量重複元件用 `lg lg-static`。
- 上游資產唯讀：`~/Desktop/UI-ToolBox`（只複製兩檔）、`../iMarine-Carbon-Tokenization-POC`（只呼叫 API、只讀 ui/index.html 作搬移來源）、`~/Desktop/LiDAR`（只 iframe、只讀資料快照）。
- 視覺基準：`docs/preview/preview-v3.html`（原始碼 `docs/preview/preview-src-v3.html`，下稱**基準檔**）。基準檔中的 CSS/HTML/JS 區塊都有中文區段註解標記，搬移時以標記定位。
- 模組色：carbon `#E9BC63`、policy `#38BDF8`、twin `#7FB4FF`、dispatch `#F5A54A`、epidemic `#F0648C`、alert `#FF7A59`、hero `#35E0A6`。
- dev server 驗證一律用 Chromium 系瀏覽器。

## 檔案地圖

```
index.html                     骨架：canvas/glow/veil/rail/main/hint + module script
vite.config.ts  tsconfig.json  package.json  .env.example  .gitignore
src/
├─ main.ts                     開機序：kit import + init、背景、rail、router、鍵盤
├─ ui/
│  ├─ liquid-glass.css / .js   自 UI-ToolBox 複製（唯讀，不改內容）
│  ├─ lg.d.ts                  window.LiquidGlass 型別宣告
│  ├─ tokens.css               設計 tokens + 共用頁面樣式（自基準檔搬）
│  └─ components.ts            screenHeader/statRow/dataSourceChip 模板函式
├─ shell/
│  ├─ registry.ts              SCREENS 註冊表（id/title/color/mode/icon/load）
│  ├─ router.ts                parseHash/initRouter/applyMode
│  ├─ rail.ts                  由 registry 生成 rail
│  └─ background.ts            harbor canvas + veil（自基準檔「點雲港口背景」搬）
├─ data/
│  ├─ types.ts                 Provider 介面 + 各 Snapshot 型別
│  ├─ exchange/mock.ts         mockProvider 工廠 + 各 mock provider
│  ├─ exchange/carbon.ts       live：包 PoC FastAPI
│  ├─ exchange/twin.ts         live：讀 LiDAR 泊位/AIS 快照
│  └─ mock/*.json              overview/policy/dispatch/epidemic/alert
└─ screens/
   ├─ types.ts                 Screen/ScreenCtx/Mode
   └─ hero|carbon|policy|twin|dispatch|epidemic|alert/
      └─ index.ts (+ *.html?raw / *.css)
tests/ router.test.ts  mock.test.ts  carbon-provider.test.ts
```

---

### Task 1: 專案骨架 + Kit + 背景系統

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `.env.example`, `index.html`
- Create: `src/main.ts`, `src/ui/lg.d.ts`, `src/ui/tokens.css`, `src/shell/background.ts`
- Copy: `~/Desktop/UI-ToolBox/liquid-glass.css` 與 `liquid-glass.js` → `src/ui/`

**Interfaces:**
- Produces: `initBackground(): { repaint(): void; setTwinOffset(h: number): void }`（後續 twin 頁時間軸用 `setTwinOffset`）；`index.html` 的掛載點 `#harbor`、`#veil`、`#rail`、`#screens`、`#hint`；CSS tokens（`--lg-accent` 等，見基準檔 `:root`）。

- [ ] **Step 1: 建立設定檔**

`package.json`：

```json
{
  "name": "imarine-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0"
  }
}
```

`vite.config.ts`（用 vitest/config 才有 `test` 欄位型別，vite CLI 讀取相容）：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173 },
  test: { environment: 'jsdom' },
});
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

`.gitignore`：`node_modules/`、`dist/`、`.env`、`.DS_Store`。
`.env.example`：

```
VITE_CARBON_API=http://127.0.0.1:8000
VITE_TWIN_URL=http://localhost:5174/examples/kaohsiung-port/index.html
```

- [ ] **Step 2: 複製 Kit 兩檔**

```bash
cp ~/Desktop/UI-ToolBox/liquid-glass.css ~/Desktop/UI-ToolBox/liquid-glass.js "src/ui/"
```

`src/ui/lg.d.ts`：

```ts
export {};
declare global {
  interface Window {
    LiquidGlass: {
      init(config?: object): void;
      attach(el: Element, opts?: object): void;
      refresh(): void;
      toast(opts: { title: string; message?: string; icon?: string; duration?: number }): void;
    };
  }
}
```

- [ ] **Step 3: index.html 骨架**

自基準檔複製 body 骨架（`<canvas id="harbor">`、`.glowfx`、`#veil`、`<aside id="rail">` 空殼、`<main id="screens">` 空殼、`#hint` 提示列），head 只留 `<meta charset>`、`<meta viewport>`、`<title>永續智能航港生態系</title>`，body 結尾 `<script type="module" src="/src/main.ts"></script>`。**不要**複製基準檔內嵌的 Kit 內容（改由 main.ts import）。

- [ ] **Step 4: tokens.css**

自基準檔第二個 `<style>` 區塊**整塊搬入**（自 `/* ═══════════ iMarine Shell 預覽 ═══════════ */` 起到區塊結尾，含 Hero/碳權/孿生/派工/政策/疫情/警報各段與「細節 refine」段），保留原有中文區段註解，不做選擇性刪減——所有選擇器都以 `#s-<id>` 或該頁專屬 class 定界，集中一檔可避免拆分遺漏。

- [ ] **Step 5: background.ts**

自基準檔 JS 的 `/* ══ 點雲港口背景 ══ */` 區段搬入並模組化：

```ts
export interface Background { repaint(): void; setTwinOffset(h: number): void }
export function initBackground(canvas: HTMLCanvasElement): Background {
  // 搬入 build/coast/paint/loop/resize 全部邏輯（含 full 模式增亮、泊位編號、
  // SHIN KUANG 168 標記與 twinOffset 位移），twinOffset 改為閉包變數由 setTwinOffset 設定。
  // reduced motion 判斷保留：matchMedia('(prefers-reduced-motion: reduce)')
  return { repaint: paint, setTwinOffset(h) { twinOffset = h; if (reduced) paint(); } };
}
```

- [ ] **Step 6: main.ts（最小開機）**

```ts
import './ui/liquid-glass.css';
import './ui/tokens.css';
import './ui/liquid-glass.js';
import { initBackground } from './shell/background';
// lg.d.ts 為 ambient 宣告（tsconfig include 已涵蓋），不需 import

document.documentElement.setAttribute('data-lg-theme', 'dark');
document.body.setAttribute('data-mode', 'cover');
export const bg = initBackground(document.getElementById('harbor') as HTMLCanvasElement);
window.LiquidGlass.init();
```

- [ ] **Step 7: 驗證**

Run: `npm install && npm run dev`，瀏覽器開 `http://localhost:5173`。
Expected: 深色點雲港口背景 + 光暈，console 無錯誤。改 `document.body.dataset.mode='full'`（devtools）背景增亮並出現泊位編號。

- [ ] **Step 8: 檢查點**

`HANDOFF.md` 進度加一行「Task 1 骨架+背景 完成」；停下供使用者檢視與 commit。

---

### Task 2: Registry + Router + Rail + 鍵盤

**Files:**
- Create: `src/screens/types.ts`, `src/shell/registry.ts`, `src/shell/router.ts`, `src/shell/rail.ts`
- Modify: `src/main.ts`
- Test: `tests/router.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `#rail`、`#screens` 掛載點。
- Produces:

```ts
// src/screens/types.ts
export type Mode = 'cover' | 'ov' | 'doc' | 'full';
export interface ToastOpts { title: string; message?: string; icon?: string; duration?: number }
export interface ScreenCtx {
  data: import('../data/types').DataExchange;
  ui: { toast(o: ToastOpts): void; refresh(): void };
  setMode(m: Mode): void;              // hero 兩段式切換用（main.ts 接 applyMode）
  background: { setTwinOffset(h: number): void; repaint(): void };   // = Task 1 的 Background
}
export interface Screen {
  mount(el: HTMLElement, ctx: ScreenCtx): void | Promise<void>;  // 每 screen 只呼叫一次（首次進入）
  show?(): void;    // 每次切入時呼叫（含首次，於 mount 之後）
  hide?(): void;    // 切出時呼叫；DOM 保留（spec 第 9 節：twin iframe 離開時不銷毀）
}
// src/shell/registry.ts
export interface ScreenDef {
  id: string; title: string; short: string; color: string; mode: Mode;
  icon: string;                        // <svg> 內部 path 標記（自基準檔 rail 按鈕搬）
  load(): Promise<{ default: Screen }>;
}
export const SCREENS: ScreenDef[];     // 順序：hero, carbon, policy, twin, dispatch, epidemic, alert
// src/shell/router.ts
export function parseHash(hash: string, ids: string[]): string;   // '#/carbon'→'carbon'，未知→'hero'
export function applyMode(m: Mode): void;                          // body[data-mode]
export function initRouter(o: { container: HTMLElement; ctx: ScreenCtx; onChange(def: ScreenDef): void }): { go(id: string): Promise<void>; current(): string };
// src/shell/rail.ts
export function initRail(el: HTMLElement, onGo: (id: string) => void): { setActive(id: string): void };
// 全域事件契約：'hero:toggle'
//   main.ts 於 Enter 鍵且 current()==='hero' 時 window.dispatchEvent(new CustomEvent('hero:toggle'))
//   hero screen（Task 6）監聽此事件切換封面/總覽
```

- [ ] **Step 1: 寫失敗測試**

`tests/router.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { parseHash } from '../src/shell/router';

const ids = ['hero', 'carbon', 'policy', 'twin', 'dispatch', 'epidemic', 'alert'];

describe('parseHash', () => {
  it('maps #/carbon to carbon', () => expect(parseHash('#/carbon', ids)).toBe('carbon'));
  it('falls back to hero on empty', () => expect(parseHash('', ids)).toBe('hero'));
  it('falls back to hero on unknown', () => expect(parseHash('#/nope', ids)).toBe('hero'));
  it('ignores missing slash', () => expect(parseHash('#carbon', ids)).toBe('hero'));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/router.test.ts`
Expected: FAIL（router.ts 不存在）。

- [ ] **Step 3: 實作**

`parseHash`：`const id = hash.startsWith('#/') ? hash.slice(2) : ''; return ids.includes(id) ? id : 'hero';`
`initRouter`（**快取式，切頁不銷毀 DOM**）：維護 `current` 與 `Map<id, { section: HTMLElement; screen: Screen }>`。`go(id)`＝舊 screen `hide?.()`、其 section 移除 `.active/.entered` → 若快取沒有：lazy `load()`、建立 `<section class="screen" id="s-<id>">` append 進 container（**不清空 container**）、`await mount(section, ctx)` 存入快取 → section 加 `.active`、雙 `requestAnimationFrame` 加 `.entered`（重新觸發 stagger）→ `screen.show?.()` → `applyMode(def.mode)` → 同步 `location.hash` → `try { window.LiquidGlass.refresh() } catch {}` → `onChange(def)`。監聽 `hashchange`。**section 的 id 必須是 `s-<id>`**——tokens.css 與 carbon.css 的選擇器都以此定界。
`registry.ts`：七筆 `ScreenDef`，icon 字串自基準檔 rail 各按鈕的 `<svg>` 內容搬；`load: () => import('../screens/<id>/index')`。
`rail.ts`：自基準檔 `<aside id="rail">` 的 markup 生成（logo + hr + 每個 def 一顆 `.rbtn`，`style="--mc:<color>"`、`data-lg-tip=short`）；`setActive` 切 `.on`。
`main.ts` 加入：建 ctx——`data` 先給 `{} as any`（Task 3 補）、`ui: { toast: o => window.LiquidGlass.toast(o), refresh: () => window.LiquidGlass.refresh() }`、`setMode: applyMode`、`background: bg`；initRail、initRouter、鍵盤（`0`→hero、`1`-`6` 依 registry 順序、`Enter` 且 `current()==='hero'` 時 `window.dispatchEvent(new CustomEvent('hero:toggle'))`）、開機 `go(parseHash(location.hash, ids))`。

- [ ] **Step 4: 跑測試**

Run: `npx vitest run`
Expected: PASS（4 tests）。

- [ ] **Step 5: 佔位 screen 驗證路由**

暫時在 `src/screens/hero/index.ts` 等七個資料夾各放最小佔位：

```ts
import type { Screen } from '../types';
const s: Screen = {
  mount(el) { el.innerHTML = '<div class="swrap"><h1>hero（開發中）</h1></div>'; },
};
export default s;
```

Run: `npm run dev`。Expected: rail 七顆按鈕可切換、active 光條正確、hash 同步、`1`-`6` 鍵可用、`#/carbon` 直開碳權佔位頁。

- [ ] **Step 6: 檢查點**

HANDOFF 加一行；停下供使用者 commit。

---

### Task 3: 資料交換層（types + mock providers）

**Files:**
- Create: `src/data/types.ts`, `src/data/exchange/mock.ts`, `src/data/mock/overview.json`, `policy.json`, `dispatch.json`, `epidemic.json`, `alert.json`
- Modify: `src/main.ts`（ctx.data 接上）
- Test: `tests/mock.test.ts`

**Interfaces:**
- Produces:

```ts
// src/data/types.ts
export type Source = 'live' | 'mock';
export interface Provider<T> { readonly source: Source; snapshot(): Promise<T> }
export interface OverviewSnapshot {
  kpi: { vessels: number; vesselsDelta: number; berthsUsed: number; berthsTotal: number; waitHr: number; waitDelta: number; co2T: number };
  sparks: { vessels: number[]; berths: number[]; wait: number[]; co2: number[] };
  weekly: { labels: string[]; points: number[] };
  modules: { id: string; label: string; value: string }[];
}
export interface PolicySnapshot {
  topic: string; grounding: number; groundingNote: string;
  sections: { heading: string; html: string }[];        // html 內含 <span class="cite" data-src="n">
  sources: { no: number; name: string; grade: string; date: string }[];
}
export interface DispatchSnapshot {
  metrics: { csi: number; pod: number; far: number };
  winds: number[]; rains: number[];                      // 各 10 筆，t=0..90 step10
  suggestions: { level: 'rose' | 'amber' | 'ok'; title: string; body: string; why: string }[];
}
export interface EpidemicSnapshot {
  ship: string; risk: number; level: string;
  factors: { name: string; value: number }[];
  ports: { name: string; date: string; note: string; mark: 'dim' | 'rose' | 'amber' }[];
  advice: string[]; reference: string;
}
export interface AlertSnapshot {
  kpi: { today: number; reached: number; avgSec: number; pending: number };
  feed: { cat: 'epi' | 'wx' | 'ok'; sev: string; title: string; body: string; time: string }[];
  sms: { text: string; old: boolean }[];
}
export interface CarbonSummary { ok: boolean; issued: number; tonsCirculating: number; listed: number; retired: number }
// 欄位語意（對齊 PoC su 資料表，欄位名已查證 backend/ledger.py：amount/status/owner/purpose/data_hash）：
//   issued = sus 總數；tonsCirculating = status!=='retired' 的 amount 加總；
//   listed = status==='listed' 數；retired = status==='retired' 數
export interface TwinSnapshot { berths: { id: string; name: string }[]; trackCount: number }
export interface DataExchange {
  overview: Provider<OverviewSnapshot>;
  policy: Provider<PolicySnapshot>;
  dispatch: Provider<DispatchSnapshot>;
  epidemic: Provider<EpidemicSnapshot>;
  alert: Provider<AlertSnapshot>;
  carbon: Provider<CarbonSummary> & { base: string };
  twin: Provider<TwinSnapshot> & { url: string };
}
// src/data/exchange/mock.ts
export function mockProvider<T>(data: T): Provider<T>;   // source:'mock'，snapshot 回傳深拷貝
export function createMockExchange(): Omit<DataExchange, 'carbon' | 'twin'>;
```

- [ ] **Step 1: 寫失敗測試**

`tests/mock.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { mockProvider, createMockExchange } from '../src/data/exchange/mock';

describe('mockProvider', () => {
  it('is mock-sourced and returns a copy', async () => {
    const p = mockProvider({ a: [1] });
    expect(p.source).toBe('mock');
    const s = await p.snapshot();
    s.a.push(2);
    expect((await p.snapshot()).a).toEqual([1]);
  });
});
describe('createMockExchange', () => {
  it('dispatch snapshot has 10 timesteps', async () => {
    const ex = createMockExchange();
    const d = await ex.dispatch.snapshot();
    expect(d.winds).toHaveLength(10);
    expect(d.rains).toHaveLength(10);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**（`npx vitest run tests/mock.test.ts` → FAIL）

- [ ] **Step 3: 實作**

`mockProvider`：`{ source: 'mock', snapshot: async () => structuredClone(data) }`。
mock JSON 內容 = 基準檔各頁的假資料原封搬出（數字、文案、時間都一致）：overview（KPI 128/47/62/3.4/4820、sparks、近 7 日 bar、六模組摘要）、policy（五段 html + 5 來源 + grounding 93）、dispatch（WINDS/RAINS 兩陣列 + 4 建議卡 + CSI/POD/FAR）、epidemic（SHIN KUANG 168、72 橙級、三因子、四港序列、防護建議、新光輪案例文）、alert（4 KPI + 6 feed + 2 sms）。
`createMockExchange` 以 `import x from '../mock/x.json'` 組裝。
`main.ts`：`ctx.data = { ...createMockExchange(), carbon: carbonStub, twin: twinStub }`——本 task 先用 `mockProvider` 假 stub 佔 carbon/twin 位（`base`/`url` 給 env 值），Task 4/8 換 live。

- [ ] **Step 4: 跑測試**（`npx vitest run` → PASS）

- [ ] **Step 5: 檢查點**（HANDOFF 一行；使用者 commit）

---

### Task 4: Carbon live provider

**Files:**
- Create: `src/data/exchange/carbon.ts`
- Modify: `src/main.ts`
- Test: `tests/carbon-provider.test.ts`

**Interfaces:**
- Consumes: `Provider`/`CarbonSummary`（Task 3）。PoC 後端路由（已確認）：`GET /health` → `{ok, chainId}`；`GET /state` → `{roles, sus: [...]}`。
- Produces: `createCarbonProvider(base?: string): Provider<CarbonSummary> & { base: string }`。

已查證事實（backend/ledger.py）：su 資料表欄位 = `token_id, ship_id, amount, expiry, owner, status, purpose, data_hash`；`status` 值 = `held/listed/retired`；噸數欄位是 **`amount`**。

- [ ] **Step 1: 寫失敗測試**

`tests/carbon-provider.test.ts`（mock 全域 fetch）：

```ts
import { describe, it, expect, vi } from 'vitest';
import { createCarbonProvider } from '../src/data/exchange/carbon';

const sus = [
  { status: 'held', amount: 100 },
  { status: 'listed', amount: 50 },
  { status: 'retired', amount: 25 },
];

describe('carbon provider', () => {
  it('derives summary from /state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/health') ? { ok: true, chainId: 31337 } : { roles: {}, sus }))));
    const p = createCarbonProvider('http://x');
    const s = await p.snapshot();
    expect(s).toEqual({ ok: true, issued: 3, tonsCirculating: 150, listed: 1, retired: 1 });
  });
  it('reports ok=false when backend down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('refused'); }));
    const s = await createCarbonProvider('http://x').snapshot();
    expect(s.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**（FAIL）

- [ ] **Step 3: 實作**

```ts
import type { Provider, CarbonSummary } from '../types';

export function createCarbonProvider(
  base: string = (import.meta as any).env?.VITE_CARBON_API ?? 'http://127.0.0.1:8000',
): Provider<CarbonSummary> & { base: string } {
  return {
    source: 'live', base,
    async snapshot() {
      try {
        const [h, st] = await Promise.all([
          fetch(base + '/health').then(r => r.json()),
          fetch(base + '/state').then(r => r.json()),
        ]);
        const sus: any[] = st.sus ?? [];
        return {
          ok: !!h.ok,
          issued: sus.length,
          tonsCirculating: sus.filter(s => s.status !== 'retired').reduce((a, s) => a + (s.amount ?? 0), 0),
          listed: sus.filter(s => s.status === 'listed').length,
          retired: sus.filter(s => s.status === 'retired').length,
        };
      } catch {
        return { ok: false, issued: 0, tonsCirculating: 0, listed: 0, retired: 0 };
      }
    },
  };
}
```

- [ ] **Step 4: 跑測試**（PASS）＋ `main.ts` 換上真 provider。

- [ ] **Step 5: 端到端驗證（可選，需 PoC 後端）**

於 PoC repo 跑 `make chain`（終端 A）、`make deploy`、`make api`（終端 B），再 `curl http://127.0.0.1:8000/health`。
Expected: `{"ok":true,...}`；shell console 印 `await ctx.data.carbon.snapshot()` 得到真實數字。

- [ ] **Step 6: 檢查點**（HANDOFF；使用者 commit）

---

### Task 5: 共用 UI 元件

**Files:**
- Create: `src/ui/components.ts`
- Test: 無（純模板字串，由後續頁面驗證）

**Interfaces:**
- Produces:

```ts
export function screenHeader(o: {
  eyebrow: string;               // '航港局視角 · MODULE 01'
  color: string; title: string;
  badges?: string[];             // 技術徽章 chips
  source: Source; sourceLabel?: string;   // live→綠 chip，mock→灰
  actionsHtml?: string;          // 標題列右側自訂區
}): string;
export function statRow(items: { label: string; value: number; suffix?: string; prefix?: string; decimals?: number; delta?: string; spark?: number[]; valueClass?: string }[]): string;
export function srcChip(source: Source, label?: string): string;
export function placeholderCard(name: string): string;   // 「<name>（開發中）」玻璃佔位卡，未上線模組用
```

- [ ] **Step 1: 實作**

模板輸出對齊基準檔的 `.eyebrow/.trow/.src/.stats4` 結構（含 `lg lg-stat` + `data-lg-value/-spark` 屬性驅動）。`screenHeader` 的 eyebrow 圓點 `style="--mc:<color>"`。

- [ ] **Step 2: 驗證**

任一佔位頁 mount 改用 `screenHeader` + `statRow` 渲染一次，dev server 目視：標頭/統計卡外觀與基準檔一致（彈簧數字會動），驗完還原佔位。

- [ ] **Step 3: 檢查點**（HANDOFF；使用者 commit）

---

### Task 6: Hero screen（兩段式）

**Files:**
- Create: `src/screens/hero/index.ts`, `src/screens/hero/hero.html`（`?raw` 匯入）, `src/screens/hero/ovmap.ts`
- Modify: `src/shell/rail.ts`（cover 態隱藏已由 CSS `body[data-mode="cover"]` 處理，確認即可）

**Interfaces:**
- Consumes: `ctx.data.overview.snapshot()`、`ctx.setMode`、`SCREENS`（產生六入口卡）、`components.ts`。
- Produces: hero screen 監聽 Task 2 定義的 `hero:toggle` 全域事件（mount 綁一次；main.ts 只在 current==='hero' 時 dispatch，毋須自行解綁）。

- [ ] **Step 1: 搬 markup**

自基準檔 `<!-- ══════════ HERO ══════════ -->` 區段搬入 `hero.html`：封面（kicker/大標/副標/六入口卡/CTA/署名行）+ 總覽（header/stats4/mapbox + canvas#ovMap/六模組卡/近 7 日 chart）。六入口卡與六模組卡改為由 `SCREENS.slice(1)` 動態生成（icon/short/color 取自 registry）。KPI 與模組摘要值改綁 `overview` snapshot（欄位對應：`kpi.vessels→128` 等，spark 陣列進 `data-lg-spark`）。

- [ ] **Step 2: 搬 ovmap**

基準檔 JS `/* ══ 總覽迷你地圖 ══ */` 區段 → `ovmap.ts`：

```ts
export function initOvMap(canvas: HTMLCanvasElement): { start(): void; stop(): void };
```

rAF 迴圈自管（僅 start 後執行；reduced motion 時單幀）。

- [ ] **Step 3: 組 screen**

`index.ts`：`mount` 注入 html、渲染資料、綁定：CTA 與 `hero:toggle` 事件 → 切 `body[data-hero]` 屬性 + `ctx.setMode(state==='ov' ? 'ov' : 'cover')` + ovMap start/stop；入口卡/模組卡 click → `location.hash='#/'+id`。`show()`：恢復目前 hero 態的 mode 與 ovMap（若在總覽態）；`hide()`：ovMap.stop()。`hero:toggle` 監聽器在 mount 綁一次即可（main.ts 只在 current==='hero' 時 dispatch）。

- [ ] **Step 4: 驗證**

dev server：開站見封面（rail 隱藏、點雲背景亮）；Enter/CTA → 總覽（rail 滑入、KPI 彈簧、迷你港圖有陸地/突堤/編號/船點、模組卡可點跳頁）；再 Enter 回封面。對照基準檔 hero 兩態無明顯差異。console 無錯誤。

- [ ] **Step 5: 檢查點**（HANDOFF；使用者 commit）

---

### Task 7: Carbon screen（自 PoC 一比一搬入）

**Files:**
- Create: `src/screens/carbon/index.ts`, `carbon.html`, `carbon.css`, `carbon.ts`（自 PoC 搬移）
- Read-only source: `../iMarine-Carbon-Tokenization-POC/ui/index.html`（886 行）

**Interfaces:**
- Consumes: `ctx.data.carbon.base`（API base）、`components.ts`（僅 screenHeader）。
- Produces: 無（自包含）。

**硬性要求：操作邏輯與方式和原 PoC 完全一樣。** 基準檔碳權頁僅供版面對照，**內容以 PoC 原檔為準**。

- [ ] **Step 1: 拆檔**

讀 PoC `ui/index.html`（886 行，行號已查證），三段拆出：
1. `<style>` → `carbon.css`：刪除與 `tokens.css` 重複的 `:root`/`html,body`/背景（`.bg-fix/.bg-vignette/.guide*`）/`.topbar` 區塊；其餘（workbench、fchip、hairline、hero 空狀態、modal、pill 等）原樣保留，選擇器前綴 `#s-carbon `（避免污染他頁；可用簡單字串處理或手動加。router 建立的 section id 即 `s-carbon`，Task 2 已保證）。
2. body markup → `carbon.html`：刪除 `.bg-fix` 影片區塊（**第 150 行**）、`.guide` 導線（**第 151 行**）、`.topbar` 整塊（**第 164 行起**）；其餘（分頁 page 結構、工作台、稽核、modal）原樣保留。
3. `<script>` → `carbon.ts`：整段包成 `export function initCarbon(root: HTMLElement, apiBase: string)`；`const API = "http://127.0.0.1:8000"`（**第 380 行**）改為 `const API = apiBase`；所有 `document.querySelector/getElementById` 改為 `root.querySelector`（原檔若用 id 選取，保留 id 但查詢範圍改 root）；原 topbar 的分頁切換（工作台/稽核）與健康 chip 邏輯移到 shell 標題列元素上（見 Step 2）。

- [ ] **Step 2: shell 標題列**

`index.ts` mount 時先渲染 `screenHeader`（eyebrow `航港局視角 · MODULE 01 · IMARINE SU EXCHANGE`、title `碳權代幣化交易`、badge `TCX 海運合規專區 PoC`、source live、`actionsHtml` = 工作台/稽核 `lg-tabs` + 鏈路連線 chip + 批次發行上鏈鈕——markup 對照基準檔碳權頁標題列），再注入 `carbon.html`，最後 `initCarbon(el, ctx.data.carbon.base)`。tabs 切換沿用 PoC 原本的 page 切換函式（在 carbon.ts 內 export 供標題列綁定）。

- [ ] **Step 3: 驗證（需 PoC 後端）**

PoC repo：`make chain`、`make deploy`、`make api`。shell 進 `#/carbon`：
Expected: 統計卡、篩選 rail、SU 卡片牆、稽核表全部有真資料；健康 chip 綠；完成一輪「單筆發行 → 掛單 → 購買 → 除役」流程，行為與直接開 PoC `ui/index.html` 相同；稽核分頁驗證鈕可用。後端關閉時 chip 紅 + 原 PoC 的離線提示行為不變。

- [ ] **Step 4: 檢查點**（HANDOFF；使用者 commit）

---

### Task 8: Twin screen + twin provider

**Files:**
- Create: `src/screens/twin/index.ts`, `twin.html`, `src/data/exchange/twin.ts`
- Copy: `~/Desktop/LiDAR/examples/kaohsiung-port/data/berths-khh.json` → `public/data/berths-khh.json`
- Modify: `src/main.ts`（twin provider 換 live）

**Interfaces:**
- Consumes: `ctx.background.setTwinOffset`（Task 2 的 ScreenCtx）、`components.ts`、`ctx.ui.toast`。
- Produces: `createTwinProvider(url?: string): Provider<TwinSnapshot> & { url: string }`——`snapshot()` 讀 `/data/berths-khh.json` 回 `{ berths, trackCount }`（trackCount 先以 berths 長度代替，待 AIS 快照接入再補）。

已查證事實：`berths-khh.json` 形狀 = `{ capturedAtMs, berths: [{ code, lat, lon, angle, nameZh }] }`。

- [ ] **Step 1: twin provider**

```ts
export function createTwinProvider(
  url: string = (import.meta as any).env?.VITE_TWIN_URL ?? 'http://localhost:5174/examples/kaohsiung-port/index.html',
): Provider<TwinSnapshot> & { url: string } {
  return {
    source: 'live', url,
    async snapshot() {
      try {
        const data = await fetch('/data/berths-khh.json').then(r => r.json());
        const list = (data.berths ?? []).map((b: { code: string; nameZh: string }) =>
          ({ id: b.code, name: b.nameZh }));
        return { berths: list, trackCount: list.length };
      } catch { return { berths: [], trackCount: 0 }; }
    },
  };
}
```

- [ ] **Step 2: 搬 markup**

自基準檔 `<!-- ══════════ 孿生 ══════════ -->` 搬 `twin.html`：float-tl 標頭、float-r 四張面板（Pareto/KPI/甘特含 00-24 軸/情境按鈕）、底部時間軸。主視覺區改為 `<iframe>`：

```html
<iframe id="twinFrame" title="高雄港數位孿生" allow="fullscreen"
        style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#08111c"></iframe>
```

iframe `src` 由 provider.url 於 mount 時設定（lazy：只在首次進入本頁時設 src）。iframe 載入失敗（LiDAR dev server 未啟動）時顯示玻璃提示卡：「請於 LiDAR repo 執行 npm run dev -- --port 5174」，並退回背景 canvas 的 full 模式呈現（即基準檔行為）。

- [ ] **Step 3: 互動**

時間軸 input → 更新 `NOW +HH:MM`、KPI `data-lg-value`（彈簧）、`ctx.background.setTwinOffset(h)`（iframe 失敗退回模式下才看得到效果）；情境按鈕 → active 切換 + `ctx.ui.toast({title:'情境已套用', message:'「<名稱>」重新推演未來 24 小時'})`。

- [ ] **Step 4: 驗證**

LiDAR repo：`npm run dev -- --port 5174`。shell 進 `#/twin`：iframe 內可拖曳軌道、滑時間軸；浮動面板與時間軸操作正常；關掉 LiDAR server 重進頁面出現提示卡與退回模式。console 無錯誤。

- [ ] **Step 5: 檢查點**（HANDOFF；使用者 commit）

---

### Task 9: Dispatch screen

**Files:**
- Create: `src/screens/dispatch/index.ts`, `dispatch.html`, `heat.ts`

**Interfaces:**
- Consumes: `ctx.data.dispatch.snapshot()`（winds/rains/suggestions/metrics）、`components.ts`。

- [ ] **Step 1: 搬 markup 與熱區**

`dispatch.html` ← 基準檔 `<!-- ══════════ 派工 ══════════ -->`（標頭改用 `screenHeader`，CSI/POD/FAR chips 值綁 metrics）。
`heat.ts` ← 基準檔 `/* ══ 派工熱區 ══ */`（含 `hcoast` 海岸線與僅海面繪格）：

```ts
export function initHeat(canvas: HTMLCanvasElement): { draw(t: number): void };
```

- [ ] **Step 2: 組 screen**

滑桿 input → `heat.draw(t)` + 讀數 innerHTML（等級與顏色規則照基準檔：rain>=70 強降雨/>=50 大雨/否則陣雨；風速 >=15 rose />=13 amber）；建議卡由 snapshot.suggestions 渲染；風速折線 chart `data-lg-points` = winds。mount 時 `draw(30)`、滑桿預設 30。

- [ ] **Step 3: 驗證**

dev server：熱區含陸地/突堤脈絡、拖滑桿熱區移動且讀數變色；與基準檔派工頁對照一致。

- [ ] **Step 4: 檢查點**（HANDOFF；使用者 commit）

---

### Task 10: Epidemic screen

**Files:**
- Create: `src/screens/epidemic/index.ts`, `epidemic.html`, `route.ts`

**Interfaces:**
- Consumes: `ctx.data.epidemic.snapshot()`。

- [ ] **Step 1: 搬 markup 與航跡圖**

`epidemic.html` ← 基準檔 `<!-- ══════════ 疫情 ══════════ -->`（風險環數字/等級、三因子 meter、港序卡、防護建議、參考案例全部綁 snapshot）。
`route.ts` ← 基準檔 `/* ══ 疫情航跡 ══ */`（含各港陸地點群）：

```ts
export function drawRoute(canvas: HTMLCanvasElement, ports: EpidemicSnapshot['ports']): void;
```

港點座標表沿用基準檔四點百分比配置，`mark` 決定顏色（dim/rose/amber）。

- [ ] **Step 2: 組 screen 並驗證**

mount 渲染 + `drawRoute`；resize 重繪。dev server 對照基準檔疫情頁一致。

- [ ] **Step 3: 檢查點**（HANDOFF；使用者 commit）

---

### Task 11: Alert screen

**Files:**
- Create: `src/screens/alert/index.ts`, `alert.html`

**Interfaces:**
- Consumes: `ctx.data.alert.snapshot()`、`ctx.ui.toast`。

- [ ] **Step 1: 搬 markup**

`alert.html` ← 基準檔 `<!-- ══════════ 警報 ══════════ -->`：統計列（綁 kpi）、篩選 chips、feed（由 snapshot.feed 渲染，`data-cat` 對應）、手機 mock（sms 由 snapshot.sms 渲染）、推播規則開關。

- [ ] **Step 2: 互動**

篩選 chips → feed 過濾（照基準檔 `/* 警報：分類篩選 */` 邏輯）；「模擬推播」→ toast + 手機 `.buzz` + 插入新 `.sms.pop`（上限 3 則，文案照基準檔 `/* ══ 模擬推播 ══ */`）。

- [ ] **Step 3: 驗證與檢查點**

dev server 對照基準檔警報頁一致；HANDOFF 一行；使用者 commit。

---

### Task 12: Policy screen + 全站驗收

**Files:**
- Create: `src/screens/policy/index.ts`, `policy.html`
- Create: `README.md`
- Modify: `HANDOFF.md`

**Interfaces:**
- Consumes: `ctx.data.policy.snapshot()`、`ctx.ui.toast`。

- [ ] **Step 1: Policy screen**

`policy.html` ← 基準檔 `<!-- ══════════ 政策報告 ══════════ -->`：議題列（topic 綁 snapshot.topic）、五段報告（sections html）、Grounding 儀表（`data-lg-value` = grounding）、來源清單。互動照基準檔 `/* 政策：生成動畫 + 引用連動 */`：重新生成 → `#reportBody.skl` 1.4s + toast；cite hover → 對應 srcrow `.hl`。

- [ ] **Step 2: README**

安裝/啟動、`.env` 說明、carbon demo 前置（PoC `make chain/deploy/api`）、twin demo 前置（LiDAR `npm run dev -- --port 5174`）、鍵盤快捷、瀏覽器需求（Chromium）。

- [ ] **Step 3: 全站驗收（對照 spec 第 10 節）**

1. `npm run test` 全綠；`npm run build` 成功。
2. dev server：封面 → Enter → 總覽 → `1`-`6` 各頁全可達，console 無錯誤。
3. carbon 全流程（發行→掛單→購買→除役）與原 PoC 無差異。
4. twin iframe 可操作；關 server 有退回模式。
5. 四個 mock 頁互動與基準檔一致；逐頁與 `docs/preview/preview-v3.html` 並排目視對照無回退。
6. `prefers-reduced-motion` 模擬（devtools rendering 面板）：無動畫但畫面完整。

- [ ] **Step 4: 檢查點**

HANDOFF 更新為「shell 實作完成、驗收通過」＋殘留事項清單；使用者 commit。

---

## Self-Review 紀錄

第一輪（撰寫時）：
- Spec 覆蓋：§3 路由/鍵盤（Task 2、6）、§4 shell 三層背景與契約（Task 1、2）、§5 tokens 與共用元件（Task 1、5）、§6.0-6.6 七頁（Task 6-12）、§7 資料交換層（Task 3、4、8）、§8 結構（檔案地圖）、§9 效能降級（Task 1 reduced-motion、Task 8 iframe lazy/退回、Task 12 驗收 6）、§10 驗收（Task 12）。hero 背景影片素材（spec 4.2 註記「實作版可換」）不在本計畫——列為後續美化項，於 Task 12 HANDOFF 殘留事項記錄。

第二輪（含事實查核，已修正入文）：
1. su 資料表噸數欄位是 `amount` 而非 `tonnes`（backend/ledger.py CREATE TABLE 查證）；`CarbonSummary` 重定義為 `issued/tonsCirculating/listed/retired`，去除語意模糊的「traded」。
2. 路由改為**快取式**（mount 一次 + show/hide，DOM 不銷毀）——原設計每次切頁清空 container 會銷毀 twin iframe，違反 spec §9；Screen 契約同步改為 `mount + show?/hide?`，spec §4.3 已同步更新。
3. router 建立的 section 必須帶 `id="s-<id>"`——tokens.css 與 carbon.css 前綴選擇器依賴此 id。
4. `ScreenCtx` 增加 `background`（Task 8 需要 `setTwinOffset`，從 screen 反向 import main 會成環）與 `setMode` 接線說明。
5. 基準檔無「mkA」區塊（提案頁殘影）——Task 1 改為整塊搬移第二個 style 區塊；`import './ui/lg.d.ts'` 錯誤寫法已移除。
6. `vite.config.ts` 改用 `vitest/config` 的 defineConfig（去除 `as any`）；`hero:toggle` 事件契約補進 Task 2 的 Produces（Task 2 實作者看不到 Task 6）。
7. 事實寫死：PoC ui/index.html 行號（bg-fix 150、guide 151、topbar 164、`const API` 380）；`berths-khh.json` 形狀 `{capturedAtMs, berths:[{code, lat, lon, angle, nameZh}]}`，map 用 `code/nameZh`；基準檔全部區段標記已逐一 grep 確認存在。
- 型別一致性：`Screen/ScreenCtx/Mode`（Task 2 定義，6-12 引用）、`DataExchange` 各 Snapshot（Task 3 定義，4/6/8-12 引用）、`ScreenCtx.background`（Task 1 Background 型別，Task 8 消費）已對齊；全文無殘留 `unmount` 與 `tonnes`。
- 無 TBD/TODO；搬移類步驟均給出來源檔案、區段標記或行號、刪改清單與驗證預期。

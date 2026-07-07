# 系統設定頁（Settings）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 shell 新增第 8 個 screen「系統設定」——schema 驅動的設定框架 + 7 分區（前端/碳權/政策/四佔位），policy 分區做完整互動 mock（模型管理 + 知識庫管理），設定落地 localStorage 且有限生效。

**Architecture:** 左欄 7 分區導覽 + 右側垂直堆疊 group 卡。宣告式 schema（`sections/*.ts`）→ 統一 renderer 渲染/持久化/dirty 追蹤；複雜塊（policy 兩大塊、資料源總覽）走 `custom` 渲染器 escape hatch。儲存語意照 Primer：toggle/select/slider instant、文字欄位群 explicit（savebar）。

**Tech Stack:** Vite + vanilla TS、Liquid Glass Kit（僅 CSS class，無新依賴）、vitest、headless Chrome + CDP 驗證。

**真相來源：** spec `docs/superpowers/specs/2026-07-07-settings-page-design.md`；視覺/互動基準 `docs/preview/preview-settings.html`（61 項 CDP 斷言已驗收）。文案、mock 資料、互動細節一律以 preview 為準逐字轉錄，不自創。

## Global Constraints

- 禁止 emoji（程式碼、文案、commit 皆是）。
- Commit 訊息不加任何 Claude/Anthropic 署名；風格 `feat(settings): ...`／`fix(settings): ...`。commit 於每 task 檢查點執行（使用者已授權本計畫的 task 檢查點 commit 慣例，比照 policy/dispatch/epidemic 前例）。
- settings.css 全部選擇器 `#s-settings` 前綴；**不手寫 `backdrop-filter`**（preview 的 `.mwrap` 有 `backdrop-filter:blur(4px)`，轉錄時改為 `background:rgba(4,8,14,.82)` 純壓暗）。
- 不動 `src/twin-engine/`（vendored 唯讀）與 `src/ui/liquid-glass.{css,js}`（Kit 唯讀）。
- 既有頁面只換「讀取點」，不動操作邏輯（spec §7 鐵則）。
- localStorage key 固定 `imarine.settings.v1`，含 `_version:1`。
- 模組色：settings 中性銀灰 `#9FB0C0`（spec 定案值）。
- 驗證環境：MCP 瀏覽器可能被鎖，改用獨立 headless Chrome（`--remote-debugging-port=94xx` + 專屬 `--user-data-dir` + `--use-gl=angle --use-angle=swiftshader --run-all-compositor-stages-before-draw`，勿加 `--disable-gpu`）+ Node `ws` CDP 腳本（`NODE_PATH` 指向 repo node_modules）。
- 三綠燈指令：`npx tsc --noEmit`（0 errors）、`npx vitest run`（全綠）、`npm run build`（成功）。

## File Structure

```
src/screens/settings/
  index.ts        — Screen 生命週期 + 左欄導覽 + 分區調度（Task 2、逐 task 擴充）
  schema.ts       — SettingField/SettingGroup/SettingsSection/SettingsCtx + validateSections（Task 1）
  storage.ts      — localStorage 封裝 getSetting/setSetting/subscribe + prefersReduced（Task 1）
  renderer.ts     — schema → DOM 統一渲染器（Task 3）
  sections/
    frontend.ts   — 動效 + 地圖服務（Task 3）；資料源總覽 custom（Task 5）
    carbon.ts     — API base + 測試連線 + 鏈路資訊（Task 5）
    policy.ts     — 生成接口 + 模型管理（Task 6）+ 知識庫管理（Task 7）
    twin.ts / dispatch.ts / epidemic.ts / alert.ts — 佔位骨架（Task 3）
  settings.html   — 骨架佔位標記（Task 2）
  settings.css    — 自 preview 逐條轉錄 + #s-settings 前綴（Task 2 起累加）
tests/settings-storage.test.ts / settings-schema.test.ts（Task 1）
修改：src/shell/registry.ts、src/shell/rail.ts、src/main.ts（Task 2、4）、
      src/ui/tokens.css（Task 4）、src/shell/background.ts、src/screens/hero/ovmap.ts、
      src/screens/dispatch/index.ts、src/screens/epidemic/index.ts、src/screens/policy/index.ts、
      src/screens/twin/scene-init.ts、src/screens/epidemic/worldmap.ts（Task 4、6）、
      README.md、HANDOFF.md（Task 8）
```

---

### Task 1: storage.ts + schema.ts（TDD）

**Files:**
- Create: `src/screens/settings/storage.ts`
- Create: `src/screens/settings/schema.ts`
- Test: `tests/settings-storage.test.ts`、`tests/settings-schema.test.ts`

**Interfaces:**
- Consumes: 無（純新增）。`DataExchange` 型別自 `src/data/types.ts`、`ToastOpts` 自 `src/screens/types.ts`。
- Produces（後續全部 task 依賴，簽名固定）:
  - `getSetting<T>(key: string, fallback: T): T`
  - `setSetting(key: string, value: unknown): void`
  - `subscribe(key: string, cb: (v: unknown) => void): () => void`（回傳解除函式）
  - `prefersReduced(): boolean`（settings 覆寫 → matchMedia）
  - `type SettingField`（discriminated union，`kind` 判別）
  - `interface SettingGroup { title: string; badge?: string; saveMode: 'instant' | 'explicit'; fields?: SettingField[]; custom?(el: HTMLElement, ctx: SettingsCtx): void }`
  - `interface SettingsSection { id: string; label: string; color: string; status(): string; groups: SettingGroup[] }`
  - `interface SettingsCtx { data: DataExchange; toast(o: ToastOpts): void; rerender(): void; goto(sectionId: string, groupTitle?: string): void }`
  - `validateSections(sections: SettingsSection[]): void`（key 重複即 throw）

- [ ] **Step 1: 寫失敗測試（storage）**

`tests/settings-storage.test.ts`（vitest node 環境無 `localStorage`，storage.ts 內建記憶體 fallback，測試走 fallback 路徑即可驗證邏輯）：

```ts
import { describe, it, expect } from 'vitest';
import { getSetting, setSetting, subscribe, prefersReduced } from '../src/screens/settings/storage';

describe('settings storage', () => {
  it('round-trip：set 後 get 讀回、未設定回 fallback', () => {
    expect(getSetting('t.miss', 'dft')).toBe('dft');
    setSetting('t.a', 123);
    expect(getSetting('t.a', 0)).toBe(123);
    setSetting('t.obj', { x: [1, 2] });
    expect(getSetting<{ x: number[] }>('t.obj', { x: [] }).x).toEqual([1, 2]);
  });

  it('subscribe：setSetting 觸發回呼、解除後不再觸發', () => {
    const got: unknown[] = [];
    const off = subscribe('t.sub', (v) => got.push(v));
    setSetting('t.sub', 'one');
    off();
    setSetting('t.sub', 'two');
    expect(got).toEqual(['one']);
  });

  it('prefersReduced：settings 覆寫優先（node 無 matchMedia 時只看設定）', () => {
    setSetting('frontend.reduceMotion', false);
    expect(prefersReduced()).toBe(false);
    setSetting('frontend.reduceMotion', true);
    expect(prefersReduced()).toBe(true);
  });
});
```

`tests/settings-schema.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { validateSections, type SettingsSection } from '../src/screens/settings/schema';

const sec = (id: string, keys: string[]): SettingsSection => ({
  id, label: id, color: '#9FB0C0', status: () => '',
  groups: [{ title: 'g', saveMode: 'instant',
    fields: keys.map((k) => ({ kind: 'toggle' as const, key: k, label: k })) }],
});

describe('settings schema', () => {
  it('key 全域唯一：合法通過', () => {
    expect(() => validateSections([sec('a', ['a.x']), sec('b', ['b.x'])])).not.toThrow();
  });
  it('key 重複：throw 且訊息含重複 key', () => {
    expect(() => validateSections([sec('a', ['dup.k']), sec('b', ['dup.k'])])).toThrow(/dup\.k/);
  });
});
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/settings-storage.test.ts tests/settings-schema.test.ts`
Expected: FAIL（Cannot find module '../src/screens/settings/storage'）

- [ ] **Step 3: 實作 storage.ts**

```ts
/* 設定持久化：單一 localStorage key，node/測試環境自動退記憶體。
   getSetting/setSetting/subscribe 為全站消費 API；prefersReduced 供各頁動畫分支。 */
const KEY = 'imarine.settings.v1';

type Store = Record<string, unknown>;

const mem: Record<string, string> = {};
function read(): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(KEY);
  } catch {}
  return mem[KEY] ?? null;
}
function write(v: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, v);
      return;
    }
  } catch {}
  mem[KEY] = v;
}
function load(): Store {
  const raw = read();
  if (!raw) return { _version: 1 };
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? (o as Store) : { _version: 1 };
  } catch {
    return { _version: 1 };
  }
}

const subs = new Map<string, Set<(v: unknown) => void>>();

export function getSetting<T>(key: string, fallback: T): T {
  const s = load();
  return key in s ? (s[key] as T) : fallback;
}

export function setSetting(key: string, value: unknown): void {
  const s = load();
  s[key] = value;
  s._version = 1;
  write(JSON.stringify(s));
  subs.get(key)?.forEach((cb) => cb(value));
}

export function subscribe(key: string, cb: (v: unknown) => void): () => void {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key)!.add(cb);
  return () => {
    subs.get(key)!.delete(cb);
  };
}

/* 各頁 reduced-motion 分支的唯一入口：設定覆寫優先，其次系統偏好 */
export function prefersReduced(): boolean {
  if (getSetting('frontend.reduceMotion', false)) return true;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

- [ ] **Step 4: 實作 schema.ts**

```ts
import type { DataExchange } from '../../data/types';
import type { ToastOpts } from '../types';

export interface SettingsCtx {
  data: DataExchange;
  toast(o: ToastOpts): void;
  rerender(): void; // 重渲染目前分區（狀態變更後由 custom 渲染器呼叫）
  goto(sectionId: string, groupTitle?: string): void; // 跳轉分區並高亮指定 group（跨區依賴導引）
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export type SettingField =
  | { kind: 'text'; key: string; label: string; placeholder?: string; help?: string; disabled?: boolean }
  | { kind: 'password'; key: string; label: string; help?: string; disabled?: boolean }
  | { kind: 'select'; key: string; label: string; options: () => { value: string; label: string }[]; help?: string; disabled?: boolean }
  | { kind: 'toggle'; key: string; label: string; help?: string; disabled?: boolean }
  | { kind: 'number'; key: string; label: string; min?: number; max?: number; step?: number; help?: string; disabled?: boolean }
  | { kind: 'slider'; key: string; label: string; min: number; max: number; step?: number; disabled?: boolean }
  | { kind: 'action'; label: string; button: string; run: (ctx: SettingsCtx) => Promise<ActionResult>; disabled?: boolean }
  | { kind: 'note'; text: string };

export interface SettingGroup {
  title: string;
  badge?: string;
  badgeTone?: 'live' | 'blue' | 'wait' | 'plain';
  saveMode: 'instant' | 'explicit';
  pending?: boolean; // 佔位 group：降飽和 + 全欄位視為 disabled
  fields?: SettingField[];
  custom?: (el: HTMLElement, ctx: SettingsCtx) => void;
}

export interface SettingsSection {
  id: string;
  label: string;
  color: string;
  status: () => string;
  groups: SettingGroup[];
}

/* schema 載入期驗證：帶 key 的欄位全域唯一，重複視為工程錯誤直接 throw */
export function validateSections(sections: SettingsSection[]): void {
  const seen = new Set<string>();
  for (const s of sections)
    for (const g of s.groups)
      for (const f of g.fields ?? []) {
        if (!('key' in f)) continue;
        if (seen.has(f.key)) throw new Error('settings schema: duplicate key "' + f.key + '"');
        seen.add(f.key);
      }
}
```

- [ ] **Step 5: 跑測試確認 GREEN + 三綠燈**

Run: `npx vitest run` → 全綠（既有 11 檔 + 新 2 檔）；`npx tsc --noEmit` → 0 errors。

- [ ] **Step 6: Commit**

```bash
git add src/screens/settings/storage.ts src/screens/settings/schema.ts tests/settings-storage.test.ts tests/settings-schema.test.ts
git commit -m "feat(settings): storage 持久化封裝 + schema 型別與驗證（TDD）"
```

---

### Task 2: Shell 接入 + 頁面骨架（registry / rail / 鍵盤 / 左欄導覽）

**Files:**
- Modify: `src/shell/registry.ts:78`（陣列尾加第 8 筆）
- Modify: `src/shell/rail.ts:13-22`（settings 鈕移到底部、前加 `<hr>`）
- Modify: `src/main.ts:62`（`n <= 6` → `n <= 7`）
- Create: `src/screens/settings/index.ts`、`settings.html`、`settings.css`

**Interfaces:**
- Consumes: Task 1 的 `SettingsSection`/`validateSections`；`screenHeader` 自 `src/ui/components.ts`（簽名 `screenHeader(o): string`）；`Screen`/`ScreenCtx` 自 `src/screens/types.ts`。
- Produces: `SECTIONS: SettingsSection[]` 模組層陣列（本 task 為 7 筆最小 stub，Task 3-7 逐一換成真 sections 檔）；`index.ts` 內部函式 `renderNav()`/`renderPanel()`/`select(id)`（後續 task 擴充，簽名不變）。

- [ ] **Step 1: registry.ts 加第 8 筆（齒輪 icon，feather settings）**

在 `alert` 物件後、陣列 `];` 前加：

```ts
  {
    id: 'settings',
    title: '系統設定',
    short: '系統設定',
    color: '#9FB0C0',
    mode: 'doc',
    icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.09a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.09a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.09a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
    load: () => import('../screens/settings/index'),
  },
```

同檔第 13 行註解更新為 `// 順序：hero, carbon, policy, twin, dispatch, epidemic, alert, settings`。

- [ ] **Step 2: rail.ts 齒輪鈕移到底部**

`rail.ts:13-22` 改為（rail 是置中膠囊，無 flex spacer 需求，以第二條 `<hr>` 分隔）：

```ts
  const mainDefs = SCREENS.filter((d) => d.id !== 'settings');
  const settingsDef = SCREENS.find((d) => d.id === 'settings');
  const btn = (def: (typeof SCREENS)[number]) =>
    '<button class="rbtn" data-go="' + def.id + '" style="--mc:' + def.color + '" data-lg-tip="' + def.short + '">' +
    '<svg viewBox="0 0 24 24">' + def.icon + '</svg></button>';

  el.innerHTML =
    '<div class="logo" data-lg-tip="永續智能航港生態系"><svg viewBox="0 0 24 24" fill="none">' + LOGO_ICON + '</svg></div>' +
    '<hr>' +
    mainDefs.map(btn).join('') +
    (settingsDef ? '<hr>' + btn(settingsDef) : '');
```

- [ ] **Step 3: main.ts 鍵盤 7**

`main.ts:62` 的 `if (n >= 1 && n <= 6)` 改成 `if (n >= 1 && n <= 7)`（`SCREENS[7]` 即 settings）。

- [ ] **Step 4: settings.html + settings.css + index.ts 最小骨架**

`settings.html`（`?raw` 匯入，對齊既有頁手法）：

```html
<!--HEADER-->
<div class="sgrid">
  <nav class="subnav" id="setNav"></nav>
  <main class="spanel" id="setPanel"></main>
</div>
```

`settings.css`：自 `docs/preview/preview-settings.html` 的 `<style>` 區塊**逐條轉錄**，規則如下：
1. 全部選擇器加 `#s-settings ` 前綴（含 keyframes 名稱改 `set` 前綴防跨頁衝突：`up`→`setup-in` 不需轉錄——進場沿用 tokens.css 的 `.anim`；`sp`→`setspin`、`hlp`→`sethl`、`fadeout`→`setfade`）。
2. **刪除不轉錄**：`body`、`.swrap`、`.eyebrow`、`.hrow`（shell 已提供）；`.anim`/`@keyframes up`（tokens.css 已有）；`@media (prefers-reduced-motion)` 段（tokens.css 已涵蓋 .anim，其餘動畫本來就短）。
3. preview `.grid` 改名 `.sgrid`、`.panel` 改名 `.spanel`（避開 tokens.css 既有 `.panel` 語意），HTML/TS 同步用新名。
4. `.mwrap` 的 `backdrop-filter:blur(4px)` 移除，`background` 改 `rgba(4,8,14,.82)`。
5. 本 task 先轉錄版面段（`.sgrid`/`.subnav`/`.sitem`/`.spanel`/`.gcard`/`.ghead`/`.gbadge`/`.gnote`）與 `.hl`（keyframes 改名 `sethl`——`goto()` 高亮從本 task 就存在），其餘段落隨 Task 3-7 用到時累加轉錄。

`index.ts`：

```ts
import html from './settings.html?raw';
import './settings.css';
import { screenHeader } from '../../ui/components';
import type { Screen, ScreenCtx } from '../types';
import { validateSections, type SettingsSection, type SettingsCtx } from './schema';

let SECTIONS: SettingsSection[] = [];
let cur = 'frontend';
let root: HTMLElement;
let sctx: SettingsCtx;

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

function renderNav(): void {
  const nav = root.querySelector('#setNav') as HTMLElement;
  nav.innerHTML = SECTIONS.map(
    (s) =>
      '<div class="sitem' + (cur === s.id ? ' on' : '') + '" data-nav="' + s.id + '">' +
      '<span class="d" style="background:' + s.color + '"></span>' +
      '<span class="nm">' + esc(s.label) + '</span><span class="st">' + esc(s.status()) + '</span></div>',
  ).join('');
}

function renderPanel(): void {
  const panel = root.querySelector('#setPanel') as HTMLElement;
  panel.innerHTML = '';
  const sec = SECTIONS.find((s) => s.id === cur);
  if (!sec) return;
  // Task 3 起改用 renderer.ts 的 renderSection；本 task 先出佔位文字驗證骨架
  panel.innerHTML = '<div class="gcard"><div class="ghead"><h3>' + esc(sec.label) + '</h3></div>' +
    '<div class="gnote">分區內容於後續 task 接上。</div></div>';
}

function select(id: string): void {
  cur = id;
  renderNav();
  renderPanel();
}

const screen: Screen = {
  mount(el: HTMLElement, ctx: ScreenCtx) {
    root = el;
    sctx = {
      data: ctx.data,
      toast: (o) => ctx.ui.toast(o),
      rerender: () => renderPanel(),
      goto: (sectionId: string, groupTitle?: string) => {
        select(sectionId);
        if (groupTitle) {
          const target = [...root.querySelectorAll('.gcard .ghead h3')].find((h) => h.textContent === groupTitle);
          const card = target?.closest('.gcard');
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.remove('hl');
            void (card as HTMLElement).offsetWidth;
            card.classList.add('hl');
          }
        }
      },
    };
    // 本 task：7 筆最小 stub；Task 3-7 逐一換成 sections/ 檔案
    SECTIONS = [
      { id: 'frontend', label: '前端設定', color: '#35E0A6', status: () => '生效中', groups: [] },
      { id: 'carbon', label: '碳權代幣化', color: '#E9BC63', status: () => 'API 可設定', groups: [] },
      { id: 'policy', label: '政策報告', color: '#38BDF8', status: () => '', groups: [] },
      { id: 'twin', label: '沙盤推演', color: '#7FB4FF', status: () => '後端待接入', groups: [] },
      { id: 'dispatch', label: '派工建議', color: '#F5A54A', status: () => '後端待接入', groups: [] },
      { id: 'epidemic', label: '疫情追溯', color: '#F0648C', status: () => '後端待接入', groups: [] },
      { id: 'alert', label: '警報推播', color: '#FF7A59', status: () => '後端待接入', groups: [] },
    ];
    validateSections(SECTIONS);
    el.innerHTML = html.replace(
      '<!--HEADER-->',
      screenHeader({ eyebrow: 'SYSTEM SETTINGS', color: '#9FB0C0', title: '系統設定' }),
    );
    el.addEventListener('click', (e) => {
      const nv = (e.target as HTMLElement).closest('[data-nav]');
      if (nv) select(nv.getAttribute('data-nav') as string);
    });
    renderNav();
    renderPanel();
  },
};
export default screen;
```

註：`ScreenHeaderOptions.source` 為 optional（`src/ui/components.ts:15`，policy 頁特例既有設計）——不傳即不渲染資料源 chip，上述呼叫即最終形。

- [ ] **Step 5: 三綠燈 + CDP 驗證**

`npx tsc --noEmit`、`npx vitest run`、`npm run build` 全過。
起 `npm run dev` + 獨立 headless Chrome，CDP 斷言：
1. rail 最後一顆鈕 `data-go="settings"` 且其前有第二個 `hr`；點擊到達 `#/settings`，光條 `.on` 正確。
2. 鍵盤 `7` 到達 settings；`1`-`6`、`0` 迴歸不變；在（後續才有的）輸入框情境暫不驗。
3. `#/settings` 冷啟動直達；`data-mode="doc"`。
4. 左欄 7 項、預設 `frontend` active、點擊切換 panel 佔位文字跟著換。
5. console 零錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/shell/registry.ts src/shell/rail.ts src/main.ts src/screens/settings/
git commit -m "feat(settings): shell 接入（registry/rail 底部齒輪/鍵盤 7）+ 左欄導覽骨架"
```

---

### Task 3: renderer.ts + 前端設定（動效/地圖）+ 四佔位分區

**Files:**
- Create: `src/screens/settings/renderer.ts`
- Create: `src/screens/settings/sections/{frontend,twin,dispatch,epidemic,alert}.ts`
- Modify: `src/screens/settings/index.ts`（SECTIONS 換 sections 檔 + renderPanel 改用 renderSection）
- Modify: `src/screens/settings/settings.css`（累加轉錄欄位/toggle/savebar/佔位段）

**Interfaces:**
- Consumes: Task 1 全部；Task 2 的 `renderPanel`/`SECTIONS`。
- Produces: `renderSection(el: HTMLElement, section: SettingsSection, ctx: SettingsCtx): void`（Task 5-7 的 custom 渲染器掛載點也走它）；`tail4(key: string): string`。

- [ ] **Step 1: 實作 renderer.ts**

核心行為（完整程式碼依 preview 對應互動逐字轉錄，關鍵骨架如下）：

```ts
import { getSetting, setSetting } from './storage';
import type { ActionResult, SettingField, SettingGroup, SettingsCtx, SettingsSection } from './schema';

export function tail4(key: string): string {
  return key.length >= 4 ? '••••' + key.slice(-4) : '••••';
}

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/* group 渲染：
   - custom 有值 → 建 .gcard 容器 + ghead 後把 body 元素交給 custom(el, ctx)
   - fields → 逐欄位出 .frow；instant 欄位變更即 setSetting + flash；
     explicit 欄位變更寫入 draft、浮出 savebar，儲存時整批 setSetting + saved 綠勾，
     捨棄時重渲染整個 group（丟 draft）
   - pending group → .gcard 加 .pend、全欄位 disabled */
export function renderSection(el: HTMLElement, section: SettingsSection, ctx: SettingsCtx): void {
  el.innerHTML = '';
  section.groups.forEach((g) => el.appendChild(renderGroup(g, ctx)));
}

function renderGroup(g: SettingGroup, ctx: SettingsCtx): HTMLElement {
  const card = document.createElement('div');
  card.className = 'gcard' + (g.pending ? ' pend' : '');
  const tone = g.badgeTone === 'live' ? ' live' : g.badgeTone === 'blue' ? ' blue' : g.badgeTone === 'wait' ? ' wait' : '';
  card.innerHTML =
    '<div class="ghead"><h3>' + esc(g.title) + '</h3>' +
    (g.badge ? '<span class="gbadge' + tone + '">' + esc(g.badge) + '</span>' : '') +
    '<span class="sp"></span></div>';
  const body = document.createElement('div');
  card.appendChild(body);
  if (g.custom) {
    g.custom(body, ctx);
    return card;
  }
  const draft = new Map<string, unknown>();
  body.innerHTML = (g.fields ?? []).map((f) => fieldHtml(f, g)).join('');
  if (g.saveMode === 'explicit') {
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="savebar"><span>未儲存變更</span><span class="sp"></span>' +
        '<button class="mini act-discard">捨棄</button><button class="mini acc act-save">儲存</button></div>' +
        '<div class="saved">已儲存</div>',
    );
  }
  bindGroup(body, g, draft, ctx);
  return card;
}
```

`fieldHtml` 逐 kind 輸出（markup 逐字對齊 preview：`.frow`/`.flabel`(+`.help`)/`.fctl`；`text`/`number`→`.tin`、`password`→已存值出 `.masked` 尾四碼 +「更換」「清除」鈕、未存出 `.tin[type=password]`+「顯示」眼睛鈕、`select`→`.sel`（`options()` 呼叫時機＝渲染當下；空陣列→disabled + `.guide` 導引字）、`toggle`→`.tgl` 標記 + `.flash`、`slider`→`input[type=range].rng`、`action`→`.mini.acc` 鈕 + `.tstate` 四態（idle/`run` spinner/`ok`/`err`，`run()` Promise resolve 後寫入）、`note`→`.gnote`；`disabled`（或 group `pending`）→ 對應控件加 `disabled` 屬性）。

`bindGroup`：instant → `change`/`input` 直接 `setSetting(f.key, v)` + flash `✓ 已生效` 1.4s；explicit → 寫 `draft`、show savebar；儲存 → `draft.forEach((v,k)=>setSetting(k,v))`、hide savebar、`.saved` 綠勾（class `show`，CSS `setfade` 1.8s）；捨棄 → 重繪該 group（`card.replaceWith(renderGroup(g, ctx))` 等效作法）。password 眼睛 → `type` 切換 password/text、鈕字「顯示/隱藏」；「更換」→ `setSetting(key,'')` 後重繪；「清除」→ `confirm` 後同上。

- [ ] **Step 2: sections/frontend.ts（本 task 先兩個 group，資料源總覽 Task 5 補）**

```ts
import type { SettingsSection } from '../schema';

export const frontendSection: SettingsSection = {
  id: 'frontend',
  label: '前端設定',
  color: '#35E0A6',
  status: () => '生效中',
  groups: [
    {
      title: '動效',
      badge: '即時生效',
      badgeTone: 'live',
      saveMode: 'instant',
      fields: [
        { kind: 'toggle', key: 'frontend.reduceMotion', label: '減少動態效果', help: '覆寫系統 prefers-reduced-motion，全站生效' },
        { kind: 'toggle', key: 'frontend.entrance', label: '進場動畫', defaultOn: true, help: '關閉後各頁 stagger 進場直接顯示終態' },
      ],
    },
    {
      title: '地圖服務',
      badge: 'Mapbox',
      badgeTone: 'blue',
      saveMode: 'explicit',
      fields: [
        { kind: 'password', key: 'frontend.mapboxToken', label: 'Mapbox Token', help: '優先於 .env 的 VITE_MAPBOX_TOKEN，疫情頁地圖使用（重新整理後生效）' },
      ],
    },
  ],
};
```

註：toggle 欄位預設值機制——schema.ts 的 toggle variant 於本 task 補一個可選屬性 `defaultOn?: boolean`（Task 1 交付檔的既定擴充點，既有測試不受影響），renderer 渲染時 checked 取 `getSetting(f.key, f.defaultOn ?? false)`。`frontend.entrance` 帶 `defaultOn: true`（預設開）。

- [ ] **Step 3: 四個佔位 sections（欄位逐字對齊 preview 的 PENDING 定義）**

`sections/twin.ts`：

```ts
import type { SettingsSection } from '../schema';
export const twinSection: SettingsSection = {
  id: 'twin', label: '沙盤推演', color: '#7FB4FF', status: () => '後端待接入',
  groups: [{
    title: '2.5D 沙盤推演 · 後端整合', badge: '後端待接入', badgeTone: 'wait',
    saveMode: 'explicit', pending: true,
    fields: [
      { kind: 'text', key: 'twin.aisEndpoint', label: 'AIS 資料源端點', placeholder: 'wss://ais.example.tw/stream', disabled: true },
      { kind: 'select', key: 'twin.snapshotFreq', label: '快照更新頻率', options: () => [{ value: '10m', label: '每 10 分鐘' }], disabled: true },
      { kind: 'note', text: '此區為預留骨架 — 後端整合後由協作者依實際需求增修欄位（見 README 協作者指南：新增一筆 schema 物件即可）。' },
    ],
  }],
};
```

`dispatch.ts`（key 前綴 `dispatch.`）：ConvLSTM 推論端點（text，`http://backend/dispatch/infer`）/ 模型更新週期（select「每 10 分鐘」）/ CWA 資料源 KEY（password）+ 同款 note。
`epidemic.ts`（key 前綴 `epidemic.`）：情資爬蟲來源（text，`WHO DON / 疾管署 / 新聞 RSS`）/ WHO/疾管署 API 端點（text）/ 比對排程（select「每小時」）+ note + 額外一則 note：`Mapbox token 於「前端設定」分區統一管理。`
`alert.ts`（key 前綴 `alert.`）：細胞簡訊發送 API（text）/ 發送門檻（select「紅色警戒以上」）/ 測試發送（action，`disabled: true`，`run` 恆回 `{ok:false,message:''}` 不會被觸發）+ note。

- [ ] **Step 4: index.ts 接上 sections + renderer**

`SECTIONS` 換成 `[frontendSection, carbonStub, policyStub, twinSection, dispatchSection, epidemicSection, alertSection]`（carbon/policy 仍為 Task 2 的 stub 物件，Task 5/6 換掉）；`renderPanel()` 改為：

```ts
function renderPanel(): void {
  const panel = root.querySelector('#setPanel') as HTMLElement;
  const sec = SECTIONS.find((s) => s.id === cur);
  if (sec) renderSection(panel, sec, sctx);
}
```

settings.css 累加轉錄：`.frow/.flabel/.fctl/.tin/.sel/.eyebtn/.mini/.masked/.tgl/.flash/.savebar/.saved/.guide/.tstate/.spin`（keyframes 改名 `setspin`/`setfade`/`sethl`）與 `.gcard.pend`。

- [ ] **Step 5: 三綠燈 + CDP 驗證（對照 preview 斷言 1.5/2.x/3.x/10.x）**

1. 前端分區 2 張 group 卡（資料源總覽 Task 5 才有）；動效 toggle 撥動 → `localStorage['imarine.settings.v1']` 內 `frontend.reduceMotion` 為 true、flash 顯示；**重新整理後 toggle 保持勾選**（落地驗證，preview 做不到的這裡必驗）。
2. Mapbox token：輸入 → savebar 浮出；儲存 → 重繪成 `.masked` 尾四碼 + 更換/清除；重載後仍為已存狀態；「清除」confirm 後回輸入框。
3. 佔位四區：`.gcard.pend`、badge「後端待接入」、欄位全 disabled、twin 2+1 欄/dispatch 3+1 欄。
4. 左欄狀態小字正確；console 零錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/screens/settings/ tests/
git commit -m "feat(settings): schema 渲染器（instant/explicit 語意）+ 前端動效地圖 + 四佔位分區"
```

---

### Task 4: 有限生效接線（reduced-motion helper / 進場動畫 / mapbox / carbon base）

**Files:**
- Modify: `src/ui/tokens.css:62`（後加兩條覆寫）
- Modify: `src/main.ts`（body 屬性初始化 + subscribe + carbon base）
- Modify: `src/shell/background.ts:31`、`src/screens/hero/ovmap.ts:15`、`src/screens/dispatch/index.ts:31,70`、`src/screens/epidemic/index.ts:164`、`src/screens/policy/index.ts:31`、`src/screens/twin/scene-init.ts:432`
- Modify: `src/screens/epidemic/worldmap.ts:44-49`

**Interfaces:**
- Consumes: Task 1 的 `getSetting`/`subscribe`/`prefersReduced`。
- Produces: 全站慣例——JS reduced-motion 分支一律 `prefersReduced()`；CSS 端 `body[data-motion="reduce"]`/`body[data-anim="off"]`。

- [ ] **Step 1: tokens.css 兩條覆寫**

`tokens.css:62` 的 `@media(prefers-reduced-motion:reduce){...}` 規則後加：

```css
body[data-motion="reduce"] .anim{opacity:1;transform:none;transition:none!important;}
body[data-anim="off"] .anim{opacity:1;transform:none;transition:none!important;}
```

- [ ] **Step 2: main.ts 接線**

(a) import 補 `import { getSetting, subscribe } from './screens/settings/storage';`
(b) `document.body.setAttribute('data-mode', 'cover');`（main.ts:15）後加：

```ts
// 動效設定 → body 屬性（CSS 端）；JS 端各頁走 prefersReduced()
const applyMotionAttrs = () => {
  if (getSetting('frontend.reduceMotion', false)) document.body.setAttribute('data-motion', 'reduce');
  else document.body.removeAttribute('data-motion');
  if (!getSetting('frontend.entrance', true)) document.body.setAttribute('data-anim', 'off');
  else document.body.removeAttribute('data-anim');
};
applyMotionAttrs();
subscribe('frontend.reduceMotion', applyMotionAttrs);
subscribe('frontend.entrance', applyMotionAttrs);
```

(c) `main.ts:24` 改 `carbon: createCarbonProvider(getSetting('carbon.apiBase', '') || env.VITE_CARBON_API),`。

- [ ] **Step 3: 六個 reduced-motion 讀取點換 helper**

各檔加 `import { prefersReduced } from '<相對路徑>/screens/settings/storage';`（settings 頁自己是 `./storage`）：
- `background.ts:31`：`const reduced = matchMedia(...).matches;` → `const reduced = prefersReduced();`（開機評估，重整生效——與 spec §6.1「重新整理後生效」語意一致的 boot-time 消費者）
- `ovmap.ts:15`：同上換 `prefersReduced()`。
- `dispatch/index.ts:31`：`const RM = matchMedia(...).matches;` → `const RM = () => prefersReduced();`；`:70` 的 `RM ? 0 : 2000` → `RM() ? 0 : 2000`（每次呼叫評估，即時生效）。
- `epidemic/index.ts:164`：`const rm = matchMedia(...).matches;` → `const rm = prefersReduced();`（函式內每次呼叫評估，即時生效）。
- `policy/index.ts:31`：`const reduced = () => matchMedia(...).matches;` → `const reduced = () => prefersReduced();`。
- `twin/scene-init.ts:432`：`if (matchMedia(...).matches)` → `if (prefersReduced())`。

- [ ] **Step 4: worldmap.ts token 讀取順序**

`worldmap.ts:48` 改：

```ts
  const token: string | undefined =
    getSetting('frontend.mapboxToken', '') || (import.meta as any).env?.VITE_MAPBOX_TOKEN;
```

（檔頭補 import。）`:44-45` 降級提示文案改：`把公開 token（pk.…）填入系統設定的「地圖服務」或 .env 的 VITE_MAPBOX_TOKEN`（保留原 `<code>` 標記手法）。檔頭第 4-5 行的註解同步改寫。

- [ ] **Step 5: 三綠燈 + CDP 驗證**

1. `npx vitest run` 全綠（既有測試不動——storage 在 node 走記憶體 fallback，`prefersReduced` 無 matchMedia 也安全）。
2. CDP：settings 開「減少動態效果」→ `body[data-motion="reduce"]` 出現；切到 epidemic 觸發 `playPipe`（reduced 分支：管線直接終態）驗證 JS 端即時生效；關「進場動畫」→ `body[data-anim="off"]`、切頁 `.anim` computed opacity 直接 1。
3. settings 存假 mapbox token（`pk.test...`）→ 重整 → epidemic 頁 `mapboxgl.accessToken` 為覆寫值（或降級卡未出現改為嘗試載圖）；清除後回 .env 行為。
4. carbon：settings 尚無 UI（Task 5），以 CDP 直接寫 storage（`setSetting` 不在 window 上）：
   `localStorage.setItem('imarine.settings.v1', JSON.stringify({_version:1,'carbon.apiBase':'http://127.0.0.1:9999'}))`
   → 重整 → carbon 頁離線降級（證明 base 覆寫生效）→ `localStorage.removeItem('imarine.settings.v1')` 恢復。
5. 全站 8 頁迴歸 console 零錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/ui/tokens.css src/main.ts src/shell/background.ts src/screens/
git commit -m "feat(settings): 有限生效接線（prefersReduced helper/進場動畫/mapbox token/carbon base）"
```

---

### Task 5: 資料源總覽 + carbon 分區（真連線測試）

**Files:**
- Modify: `src/screens/settings/sections/frontend.ts`（groups 首插「資料源總覽」custom）
- Create: `src/screens/settings/sections/carbon.ts`
- Modify: `src/screens/settings/index.ts`（carbon stub 換真 section）
- Modify: `src/screens/settings/settings.css`（累加 `.dsrow`/`.chip` 段）

**Interfaces:**
- Consumes: `SettingsCtx.data`（`DataExchange`——各 provider 有 `readonly source: 'live'|'mock'`；carbon provider 有 `base: string`）；renderer 的 `renderSection`（custom 走 `g.custom(body, ctx)`）。
- Produces: 無新對外介面。

- [ ] **Step 1: 資料源總覽 custom（插入 frontendSection.groups[0]）**

```ts
{
  title: '資料源總覽',
  badge: '唯讀',
  saveMode: 'instant',
  custom(el, ctx) {
    const rows: { color: string; name: string; src: 'live' | 'mock'; note: string; probe?: boolean }[] = [
      { color: '#E9BC63', name: '碳權代幣化交易', src: ctx.data.carbon.source, note: '偵測中…', probe: true },
      { color: '#38BDF8', name: 'AI 政策輔助報告', src: ctx.data.policy.source, note: '等待協作者後端' },
      { color: '#7FB4FF', name: '2.5D 沙盤推演', src: ctx.data.twin.source, note: '內建資料（vendored）' },
      { color: '#F5A54A', name: '即時派工建議', src: ctx.data.dispatch.source, note: '等待協作者後端' },
      { color: '#F0648C', name: '疫情自動追溯', src: ctx.data.epidemic.source, note: '等待協作者後端' },
      { color: '#FF7A59', name: '自動警報推播', src: ctx.data.alert.source, note: '等待協作者後端' },
    ];
    el.innerHTML =
      rows.map((r, i) =>
        '<div class="dsrow"><span class="d" style="background:' + r.color + '"></span>' +
        '<span class="nm">' + r.name + '</span>' +
        '<span class="chip' + (r.src === 'live' ? ' live' : '') + '">' + r.src.toUpperCase() + '</span>' +
        '<span class="st" data-ds="' + i + '">' + r.note + '</span></div>',
      ).join('') +
      '<div class="gnote">後端接入後，此表即時反映各模組 provider 的 source 與連線狀態。</div>';
    // carbon 真探測：/health 可達 → ok，否則離線（AbortController 3s 逾時）
    const st = el.querySelector('[data-ds="0"]') as HTMLElement;
    const base = (ctx.data.carbon as { base?: string }).base || '';
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 3000);
    fetch(base + '/health', { signal: ac.signal })
      .then((r) => { st.textContent = r.ok ? 'PoC FastAPI · ok' : 'PoC FastAPI · 異常 ' + r.status; })
      .catch(() => { st.textContent = 'PoC FastAPI · 離線'; });
  },
}
```

- [ ] **Step 2: sections/carbon.ts**

```ts
import { getSetting } from '../storage';
import type { SettingsSection, ActionResult, SettingsCtx } from '../schema';

async function testCarbon(_ctx: SettingsCtx): Promise<ActionResult> {
  const base = getSetting('carbon.apiBase', '') || (import.meta as any).env?.VITE_CARBON_API || 'http://127.0.0.1:8000';
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4000);
  try {
    const r = await fetch(base + '/health', { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return { ok: false, message: '回應異常 HTTP ' + r.status };
    const j = await r.json().catch(() => ({}));
    return { ok: true, message: '連線成功' + (j && j.status ? ' · ' + String(j.status) : '') };
  } catch {
    clearTimeout(t);
    return { ok: false, message: '無法連線 — 確認 PoC 後端（make chain + make api）已啟動' };
  }
}

export const carbonSection: SettingsSection = {
  id: 'carbon',
  label: '碳權代幣化',
  color: '#E9BC63',
  status: () => 'API 可設定',
  groups: [
    {
      title: 'API 連線', badge: '生效中', badgeTone: 'live', saveMode: 'explicit',
      fields: [
        { kind: 'text', key: 'carbon.apiBase', label: 'API Base URL', placeholder: 'http://127.0.0.1:8000', help: '留空使用 .env 的 VITE_CARBON_API；變更後重新整理生效' },
        { kind: 'action', label: '連線驗證', button: '測試連線', run: testCarbon },
      ],
    },
    {
      title: '鏈路資訊', badge: '唯讀', saveMode: 'instant',
      custom(el) {
        el.innerHTML = '<div class="gnote" id="cbChain">後端離線 — 依 README 前置步驟啟動 PoC 的 make chain + make api 後，此處顯示鏈上狀態摘要。</div>';
        const base = getSetting('carbon.apiBase', '') || (import.meta as any).env?.VITE_CARBON_API || 'http://127.0.0.1:8000';
        fetch(base + '/state').then((r) => r.json()).then((j) => {
          const n = Array.isArray(j?.sus) ? j.sus.length : 0;
          (el.querySelector('#cbChain') as HTMLElement).textContent = '鏈上狀態：SU ' + n + ' 筆 · 資料源 ' + base;
        }).catch(() => {});
      },
    },
  ],
};
```

- [ ] **Step 3: 三綠燈 + CDP 驗證（對照 preview 斷言 1.3/1.4/4.x）**

1. 前端分區第一張卡＝資料源總覽 6 列、LIVE chip 2 個（carbon/twin）；PoC 後端未起時 carbon 列顯「離線」；若後端在線顯「ok」。
2. carbon 分區：改 base → savebar → 儲存 → 重載保留；測試連線 → `run` spinner → 後端未起顯紅字含指引文案；起 PoC 後端（若環境可行）驗綠字，否則以 `http://127.0.0.1:1`（必失敗）與本機任一活埠驗證兩態，並記錄於 task 報告。
3. console 零錯誤（fetch 失敗的網路訊息屬預期，非 JS 例外）。

- [ ] **Step 4: Commit**

```bash
git add src/screens/settings/
git commit -m "feat(settings): 資料源總覽（carbon 真探測）+ carbon API 連線分區"
```

---

### Task 6: policy 分區上半——生成接口 + 模型管理 + 雙向同步

**Files:**
- Create: `src/screens/settings/sections/policy.ts`（本 task：生成接口 + 模型管理；知識庫 Task 7 同檔續加）
- Modify: `src/screens/settings/index.ts`（policy stub 換真 section）
- Modify: `src/screens/policy/index.ts:18,525-537`（llm 讀寫 settings + subscribe）
- Modify: `src/screens/settings/settings.css`（累加 `.pgrid`/`.pcard`/`.seg`/`.mwrap`/`.mbox`/`.mhead`/`.msec`/`.mdlrow` 段）

**Interfaces:**
- Consumes: Task 1-3 全部。
- Produces（Task 7 依賴）:
  - storage keys：`policy.llmMode`（'local'|'cloud'）、`policy.providers`（`ProviderCfg[]`）、`policy.defaults`（`{reasoning:string;embedding:string;rerank:string}`）
  - `interface ProviderCfg { id: string; name: string; urlPh: string; keyOptional: boolean; url: string; key: string; connected: boolean; models: { id: string; kind: 'chat'|'embedding'|'rerank'; enabled: boolean }[]; catalog?: { id: string; kind: 'chat'|'embedding'|'rerank' }[] }`
  - `connectedModels(kind: 'chat'|'embedding'|'rerank'): string[]`（自 storage 讀 providers 計算聯集，export 供 Task 7 用）
  - `PROVIDER_PRESET: ProviderCfg[]`（首次無 storage 值時寫入的預置四家，內容逐字對齊 preview 的 `S.policy.providers` + catalog）

- [ ] **Step 1: policy.ts——資料預置與聯集**

```ts
import { getSetting, setSetting } from '../storage';
import type { SettingsSection, SettingsCtx } from '../schema';

export interface ProviderCfg {
  id: string;
  name: string;
  urlPh: string; // API URL placeholder
  keyOptional: boolean; // 地端服務可免金鑰
  url: string;
  key: string; // mock 階段明文存 localStorage（demo 假 key）；README 明記真後端 key 只送不回
  connected: boolean;
  models: { id: string; kind: 'chat' | 'embedding' | 'rerank'; enabled: boolean }[];
  catalog?: { id: string; kind: 'chat' | 'embedding' | 'rerank' }[]; // 連線驗證通過後載入的預錄清單
}

export interface PolicyDefaults {
  reasoning: string;
  embedding: string;
  rerank: string;
}

export const DEFAULTS_PRESET: PolicyDefaults = { reasoning: 'qwen3:8b', embedding: 'bge-m3', rerank: '' };
// 讀取一律 getSetting('policy.defaults', DEFAULTS_PRESET)

export const PROVIDER_PRESET: ProviderCfg[] = [
  { id: 'ollama', name: 'Ollama（地端）', urlPh: 'http://localhost:11434', keyOptional: true,
    url: 'http://localhost:11434', key: '', connected: true,
    models: [
      { id: 'qwen3:8b', kind: 'chat', enabled: true },
      { id: 'bge-m3', kind: 'embedding', enabled: true },
      { id: 'bge-reranker-v2', kind: 'rerank', enabled: false },
    ] },
  { id: 'openai', name: 'OpenAI 相容', urlPh: 'https://api.openai.com/v1', keyOptional: false,
    url: '', key: '', connected: false, models: [],
    catalog: [
      { id: 'gpt-4.1-mini', kind: 'chat' }, { id: 'gpt-4.1', kind: 'chat' },
      { id: 'text-embedding-3-small', kind: 'embedding' },
    ] },
  { id: 'anthropic', name: 'Anthropic', urlPh: 'https://api.anthropic.com', keyOptional: false,
    url: '', key: '', connected: false, models: [],
    catalog: [{ id: 'claude-sonnet-5', kind: 'chat' }, { id: 'claude-haiku-4-5', kind: 'chat' }] },
];

export function getProviders(): ProviderCfg[] {
  return getSetting<ProviderCfg[]>('policy.providers', PROVIDER_PRESET);
}
export function connectedModels(kind: 'chat' | 'embedding' | 'rerank'): string[] {
  const out: string[] = [];
  getProviders().forEach((p) => {
    if (!p.connected) return;
    p.models.forEach((m) => { if (m.enabled && m.kind === kind) out.push(m.id); });
  });
  return out;
}
```

- [ ] **Step 2: 生成接口 group（instant segmented）+ 模型管理 custom**

`policySection.groups[0]`（生成接口）：custom 渲染 `.seg` 兩鈕（地端部署/雲端 API），初值 `getSetting('policy.llmMode','local')`，點擊 `setSetting` + flash；**不用 toast**（policy 頁自己的切換器有 toast，這裡是設定頁語意，inline flash 即可）。

`policySection.groups[1]`（模型管理）custom 渲染器，行為逐字對齊 preview：
- 供應商卡牆：`getProviders()` map 出 `.pcard`（已連線 `.ok` + 綠燈 + `tail4(key)` 或「免金鑰（地端）」+ 啟用模型數；未連線出「Setup」）+ 尾張 `.pcard.addc`「+ 自訂供應商」。
- 卡點擊 → Setup modal（modal DOM 由 custom 建立一次、掛在 section 容器內，`.mwrap.open` 顯示）：URL/`KEY`（password + 眼睛）/「測試連線」四態（mock 驗證：URL `^https?:\/\/.+` + （key 非空 ∨ keyOptional ∨ 已存 key）→ 1.2s 假延遲成功；否則紅字）→ 成功載入模型清單（`p.models` 或 `catalog.map(m=>({...m,enabled:m.kind==='chat'}))`）checkbox 啟停 → 儲存鈕解鎖 → 儲存寫回 `policy.providers`（`setSetting`）＋關 modal ＋ `ctx.rerender()`。已連線供應商可重開修改、「移除供應商」confirm 後過濾掉並校正 defaults（不在聯集的 default 改聯集首項或 ''）。「+ 自訂供應商」→ 新 `ProviderCfg`（id `custom-<ts>`、三筆 catalog：custom-chat-model/custom-embed-model/custom-rerank-model）。
- 系統預設模型：三個 `.sel`（推理/Embedding/Rerank）選項自 `connectedModels()`，空 → disabled + `.guide`「請先設定至少一個供應商」（rerank 專屬文案「尚無已啟用的 rerank 模型（至供應商卡啟用）」）；變更 instant `setSetting('policy.defaults', {...})` + flash。
- section `status: () => getProviders().filter(p=>p.connected).length + ' 供應商已連線'`。

- [ ] **Step 3: policy 頁雙向同步（只換讀寫點）**

`src/screens/policy/index.ts`：
(a) 檔頭 import 補 `import { getSetting, setSetting, subscribe } from '../settings/storage';`
(b) `:18` `let llm: keyof typeof MODEL = 'local';` → `let llm: keyof typeof MODEL = getSetting('policy.llmMode', 'local') as keyof typeof MODEL;`
(c) `:525-537` 切換 handler 內，`llm = btn.getAttribute('data-llm') as keyof typeof MODEL;` 之後加一行 `setSetting('policy.llmMode', llm);`
(d) `mount()` 內（切換器綁定之後）加 subscribe（設定頁改 → 本頁 segmented 跟隨；注意 handler 內 `setSetting` 會回射，靠值比對免震盪）：

```ts
    subscribe('policy.llmMode', (v) => {
      if (v !== 'local' && v !== 'cloud') return;
      if (v === llm) return;
      llm = v;
      el.querySelectorAll('.lbtn').forEach((x) =>
        x.classList.toggle('on', x.getAttribute('data-llm') === llm));
    });
```

（`el` 為 mount 參數，closure 可用；初始 markup `:518-519` 的 `class="lbtn on"` 寫死 local——改為依 `llm` 初值決定哪顆帶 `on`。）

- [ ] **Step 4: 三綠燈 + CDP 驗證（對照 preview 斷言 5.x/6.x + 雙向同步）**

1. preview 斷言 5.1-5.7、6.1-6.11 全套在實作版重跑（尾四碼、聯集、卡片狀態、四態、儲存鎖）。
2. **落地**：Setup 完 OpenAI 相容 → 重整 → 卡片仍已連線、defaults 仍在。
3. **雙向同步**：settings 切「雲端 API」→ 到 policy 頁 segmented 已在 cloud；policy 頁切回地端 → 回 settings 分區 segmented 在 local；重整後保留。
4. policy 頁既有互動迴歸：切換 toast 照舊、生成/回答計時吃切換後的值（抽 1-2 個 policy 舊斷言重驗）。
5. console 零錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/screens/settings/ src/screens/policy/index.ts
git commit -m "feat(settings): policy 模型管理（供應商 Setup/預設模型）+ llmMode 落地與政策頁雙向同步"
```

---

### Task 7: policy 分區下半——知識庫管理

**Files:**
- Modify: `src/screens/settings/sections/policy.ts`（續加知識庫 group + KB modal + 新增庫 modal）
- Modify: `src/screens/settings/settings.css`（累加 `.kbgrid`/`.kbcard`/`.docrow`/`.drop`/`.strat`/`.scard`/`.subopt`/`.rng`/`.rlab` 段）
- Test: `tests/settings-policy-preset.test.ts`（spec §10 vitest 第 4 項：預置資料契約）

**Interfaces:**
- Consumes: Task 6 的 `connectedModels`、storage keys。
- Produces: storage key `policy.kbs`（`Kb[]`）；`interface Kb { id: string; name: string; desc?: string; docs: { id: string; name: string; status: 'available'|'indexing' }[]; chunk: { size: number; overlap: number }; retrieval: { strategy: 'vector'|'fulltext'|'hybrid'; hybridWeight: number; rerank: boolean; rerankModel: string; embeddingModel: string } }`；`KB_PRESET: Kb[]`（五庫 + 文件名清單**逐字轉錄自 preview 的 `S.policy.kbs`**——航港法令 12 檔/海運焦點新聞 9 檔/全球航運指數 7 檔/台灣數據統計 8 檔/替代能源專區 6 檔，檔名一字不改）。

- [ ] **Step 1: 知識庫 group（custom）**

行為逐字對齊 preview：
- 卡牆：`getSetting('policy.kbs', KB_PRESET)` map `.kbcard`（庫名 + `n 文件 · strategy(+· rerank)`）+ hover 刪除鈕（confirm 文案含庫名與文件數）+ `.kbcard.addc`「+ 新增知識庫」+ ghead 右側「重置為預設」鈕（confirm 後 `setSetting('policy.kbs', 結構複製的 KB_PRESET)`）。
- group badge 動態：`${kbs.length} 庫 · ${總文件數} 文件`。
- 新增庫 modal：名稱（必填，空值 focus 不關）+ 描述（選填）→ 建立 `{ id:'kb'+Date.now()%100000, docs:[], chunk:{size:512,overlap:64}, retrieval:{strategy:'vector',hybridWeight:60,rerank:false,rerankModel:'',embeddingModel:connectedModels('embedding')[0]||''} }`。
- KB modal（點卡開啟）：
  (a) 文件表 `.docrow`（檔名/`available` 綠/`indexing…` 琥珀/刪除 × confirm）——文件操作**即時生效**（直接 `setSetting`）；
  (b) 上傳：`.drop` 點擊 → 隱藏 `input[type=file][multiple]` → 取檔名入表 `status:'indexing'`，`setTimeout 3000` 轉 `available`（modal 開著就重繪文件表；一律 `setSetting` 落地）；
  (c) 參數（draft + savebar **explicit**）：chunk size（number，預設 512）/overlap（number）/embedding 模型（select 自 `connectedModels('embedding')`，空→disabled）/檢索策略三張 `.scard` radio（vector/fulltext/hybrid）；
  (d) progressive disclosure：`hybrid` → `.subopt` 權重 slider（0-100，label `(w/100).toFixed(1)`）；rerank toggle 開 → `connectedModels('rerank')` 非空出 rerank 模型 select、空則 `.guide`「尚無可用 rerank 模型 — 先至模型管理設定」點擊 → 關 modal + `ctx.goto('policy','模型管理')`（跳轉 + `.hl` 高亮，Task 2 的 goto 已支援）；
  (e) 儲存 → `chunk`/`retrieval` 寫回該庫 + `setSetting` + savebar 收 + `.saved` 綠勾 + 卡牆 meta 重繪；捨棄 → 丟 draft 重繪參數區。

- [ ] **Step 2: 預置資料契約測試（spec §10 vitest 第 4 項）**

`tests/settings-policy-preset.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { PROVIDER_PRESET, KB_PRESET, DEFAULTS_PRESET } from '../src/screens/settings/sections/policy';

describe('policy 預置資料契約', () => {
  it('供應商：3 家預置、Ollama 已連線含三種 kind、雲端家帶 catalog', () => {
    expect(PROVIDER_PRESET).toHaveLength(3);
    const ollama = PROVIDER_PRESET.find((p) => p.id === 'ollama')!;
    expect(ollama.connected).toBe(true);
    expect(new Set(ollama.models.map((m) => m.kind))).toEqual(new Set(['chat', 'embedding', 'rerank']));
    PROVIDER_PRESET.filter((p) => !p.connected).forEach((p) => {
      expect(p.catalog && p.catalog.length).toBeTruthy();
    });
  });
  it('知識庫：五庫、文件數 12/9/7/8/6、每庫 chunk 與 retrieval 欄位齊全', () => {
    expect(KB_PRESET.map((k) => k.docs.length)).toEqual([12, 9, 7, 8, 6]);
    KB_PRESET.forEach((k) => {
      expect(k.chunk.size).toBeGreaterThan(0);
      expect(['vector', 'fulltext', 'hybrid']).toContain(k.retrieval.strategy);
      expect(typeof k.retrieval.rerank).toBe('boolean');
    });
  });
  it('預設模型：形狀為 reasoning/embedding/rerank 三欄字串', () => {
    expect(Object.keys(DEFAULTS_PRESET).sort()).toEqual(['embedding', 'reasoning', 'rerank']);
  });
});
```

Run: `npx vitest run tests/settings-policy-preset.test.ts` → PASS（KB_PRESET 需自本 task Step 1 export）。

- [ ] **Step 3: 三綠燈 + CDP 驗證（對照 preview 斷言 7.x/8.x/9.x）**

1. preview 斷言 7.1-7.8、8.1-8.6、9.1-9.3 全套在實作版重跑。
2. **落地**：改 chunk 存檔 + 上傳一檔 + 刪一庫 → 重整 → 全部保留；「重置為預設」→ 重整 → 預設五庫。
3. rerank 導引：`goto('policy','模型管理')` 跳轉 + 高亮動畫。
4. console 零錯誤。

- [ ] **Step 4: Commit**

```bash
git add src/screens/settings/ tests/settings-policy-preset.test.ts
git commit -m "feat(settings): policy 知識庫管理（多庫/文件/chunk/檢索策略 progressive disclosure）+ 預置契約測試"
```

---

### Task 8: README 協作者指南 + 全站驗收 + HANDOFF 收尾

**Files:**
- Modify: `README.md`（新章「協作者指南」）
- Modify: `HANDOFF.md`（第 1 節現況 + 第 4 節下一步）

**Interfaces:** 無程式碼變更（純文件 + 驗收）。

- [ ] **Step 1: README 新章「協作者指南」**

依 spec §8 四節撰寫（繁中 + 英術語、無 emoji）：
1. **新增/刪除設定欄位**：`src/screens/settings/sections/<模組>.ts` 說明 + 欄位型別表（8 種 kind 各一行：用途/必填屬性）+ 可複製範例（一個 text + 一個 toggle，含 `saveMode` 差異說明與 key 命名規則 `<模組>.<欄位>`）+「刪除 = 刪物件」+ key 重複會在載入期 throw 的提醒。
2. **讀取設定值**：`getSetting('模組.key', fallback)`、`setSetting`、`subscribe`（附 policy.llmMode 雙向同步當實例）。
3. **mock → live**：provider 介面（`source`/`snapshot()`）、換真後端只改 `src/data/exchange/` 對應 provider、UI 與 screen 不動；設定頁 action `run()` 換成真端點呼叫；**API key 只送不回**（後端回 masked key）原則。
4. **前端頁面設計規範（PR 檢查基準）**：
   - 技術契約：Screen 介面（mount 一次/show/hide/DOM 快取）、檔案結構 `src/screens/<id>/{index.ts,<id>.html,<id>.css}`、CSS `#s-<id>` 前綴、canvas 重繪綁 `show()`、計時器 `hide()` 清除、reduced-motion 一律 `prefersReduced()`。
   - 設計系統：Kit 元件鐵則（不手寫 backdrop-filter、lg-static、玻璃容器+實心內容）、tokens（底 `#070b11`、主色 `#35E0A6`、髮絲線 `rgba(255,255,255,.1)`、Inter/Noto Sans TC + Geist Mono）、模組輔助色表 + 使用限制（rail active/eyebrow 圓點/徽章）。
   - 版面節奏：eyebrow（`screenHeader()`）→ 標題列 → KPI（`statRow()`）→ 主視覺 62% + 右欄；背景兩態（空間型亮/文件型 `data-mode="doc"`）。
   - 內容原則：mock 頁不是空殼、schema 跟後端契約走、不臆造欄位。
   - 「新模組頁面 PR 自查清單」：上述各項 checkbox 條列（10-14 條）。

- [ ] **Step 2: 全站驗收（spec §10 全項）**

1. 三綠燈：`npx tsc --noEmit` 0 / `npx vitest run` 全綠（14 檔：既有 11 + settings-storage/settings-schema/settings-policy-preset）/ `npm run build` 成功。
2. CDP 逐項（spec §10 headless 清單 1-9）：rail/鍵盤 `7`/`0-6` 迴歸、7 分區、instant/explicit + 重載保留、供應商全流程、知識庫全流程、llmMode 雙向、mapbox 覆寫、reduced-motion 設定生效 + `prefers-reduced-motion` 模擬、**8 頁全站迴歸**（hero→carbon→policy→twin→dispatch→epidemic→alert→settings→hero）console 零錯誤。
3. 鍵盤迴歸：settings 頁輸入框內打 `1`-`7` 不跳頁（既有 bail-out 涵蓋）；非輸入框情境 `7` 導覽正常。
4. 截圖存證（frontend/policy/KB modal 三張，SwiftShader）。

- [ ] **Step 3: HANDOFF.md 更新**

第 1 節頂部改寫為 settings 頁現況（含：epidemic 已於 2026-07-05 合併 push 的事實一併補正——HANDOFF 原文停在「待合併」）；第 4 節下一步改為 settings 收尾流程（whole-branch review → 使用者實機驗收 → 合併方式）。

- [ ] **Step 4: Commit**

```bash
git add README.md HANDOFF.md
git commit -m "docs(settings): README 協作者指南（設定 schema/mock→live/前端設計規範+PR 自查）+ HANDOFF 收尾"
```

---

## Self-Review 紀錄

第一輪（撰寫後）+ 第二輪（對照 spec 與程式碼實況重審，修正 6 項）：

- **Spec coverage**：§3 shell（Task 2）、§4 版面（Task 2-3）、§5 框架（Task 1、3）、§6.1（Task 3、5）、§6.2（Task 6、7）、§6.3（Task 5）、§6.4（Task 3）、§7 接線（Task 4、6；carbon base 在 Task 4）、§8 README（Task 8）、§10 驗收（各 task + Task 8 總驗）——第二輪補上原缺漏的 §10 vitest 第 4 項「預置資料契約」測試（Task 7 Step 2）。§9 preview 已於 brainstorm 階段完成驗收，不在本計畫範圍。
- **Placeholder scan**：第二輪修正——`ProviderCfg` 原為 `/* 如上 */` 註解改為完整欄位、`applyMotionAttrs` 清除冗餘行與曖昧註記、Task 3 toggle 預設值段落改為明確決定（`defaultOn?: boolean`）、補 `DEFAULTS_PRESET` 定義與讀取預設。settings.css「自 preview 逐條轉錄 + 指定改名規則」為 repo 內既有慣例（dispatch/epidemic 前例），preview 即逐字來源，非佔位。
- **Type consistency**：`SettingsCtx.goto(sectionId, groupTitle?)` Task 2 定義、Task 7 消費；`connectedModels(kind)`/`PROVIDER_PRESET`/`DEFAULTS_PRESET` Task 6 定義、Task 7 消費（含測試 import）；`KB_PRESET` Task 7 定義並 export；`tail4` Task 3 定義、Task 6 消費；storage 簽名全計畫一致。
- **程式碼實況核對（第二輪）**：`screenHeader.source` 確認 optional（components.ts:15），Task 2 呼叫即最終形；`setSetting` 不在 window，Task 4 CDP 驗證改直寫 localStorage；dispatch `RM` 僅 2 個使用點（:31/:70）與計畫一致；`.hl` 樣式轉錄補進 Task 2 清單（`goto()` 自 Task 2 起存在）；Task 8 測試檔數更正為 14。

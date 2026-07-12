# 集中式背景影片層 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把目前只有 hero 具備的滿版 seamless loop 影片底圖，抽成全站共用的集中式背景層，讓 carbon/policy/dispatch/epidemic/alert/agent 六頁能各自掛上依功能量身的背景影片；hero 一併收編到此層。

**Architecture:** 新增 `src/shell/backdrop.ts` 管理單一共用 `<video id="backdrop">`，依 active screen 的 `ScreenDef.bg` 切換影片來源；scrim 強度純 CSS（`body[data-mode]`）自動反應。整合走 router 既有的 `onChange(def)` callback（零 router.ts 改動）。缺 `bg` 的頁（twin、素材未到位的頁）自動退回既有 `#harbor` 點雲 canvas。

**Tech Stack:** Vite + vanilla TypeScript、vitest（純函式測試）、既有 headless Chrome + CDP（渲染驗收）、ffmpeg（poster 抽幀，沿用 demo 管線既有依賴）。

## Global Constraints

- 對話用中文；文件繁體中文 + English 術語混用。
- **禁止 emoji**（CLAUDE.md CORE RULE）。
- **禁止順手清理**（typo/import/型別補強/註解）——本計畫內移除 hero 影片相關程式碼屬計畫範圍內的必要移除，非 drive-by。
- commit 訊息**不得**含任何 Claude/Anthropic 署名；author 維持 charles。
- 三綠燈為每個含產品碼 task 的收尾門檻：`npx tsc --noEmit` 0 errors、`npx vitest run` 全綠、`npm run build` 成功。
- 背景影片以 `<video>` + gradient scrim 實作，非玻璃元件，不涉 Liquid Glass Kit；**不手寫 `backdrop-filter`**。
- **twin 永不加 `bg`**（其原生 WebGL 自填畫面）。
- 資產規格：mp4 / H.264 / 約 1620×1080（16:9）/ seamless loop / 單支 < 2MB / 放 `src/screens/<id>/<id>-bg.mp4`。
- 背景影片頁的 `#backdrop`(z-3) 蓋掉 `.glowfx`(z-1) 與 `#veil`(z-2) 為預期行為；無影片頁 `#backdrop` 隱藏、二者行為不變。

---

## File Structure

- **Create** `src/shell/backdrop.ts` — 集中背景層：`resolveBackdrop()` 純函式 + `initBackdrop()` DOM 生命週期。
- **Create** `tests/backdrop.test.ts` — `resolveBackdrop()` 純函式測試。
- **Create** `scripts/backdrop-poster.mjs` — 由某頁 mp4 抽一幀當 reduced-motion poster 的 asset-prep 腳本。
- **Modify** `src/shell/registry.ts` — `ScreenDef` 加 `bg?`/`poster?`；hero 填入既有 mp4/jpg（Task 3）；六頁逐一填（Task 5，gated on 素材）。
- **Modify** `index.html` — `#veil` 之後插入 `<video id="backdrop">` + `<div id="backdrop-scrim">`。
- **Modify** `src/ui/tokens.css` — `#backdrop`/`#backdrop-scrim` 版面 + `data-bg` 開關 + `data-mode` scrim 三態。
- **Modify** `src/main.ts` — `initBackdrop()` + 在既有 `onChange` 內呼叫 `backdrop.setScreen(def)`。
- **Modify** `src/screens/hero/hero.html` — 移除 `<video class="herobg">` + `<div class="heroscrim">`。
- **Modify** `src/screens/hero/hero.css` — 移除 `.herobg`/`.heroscrim` 及其 reduced-motion 參照。
- **Modify** `src/screens/hero/index.ts` — 移除 hero 自己的影片 import/生命週期/reduced-motion 段。
- **Modify** `README.md` — 新增「頁面背景影片」章節（加一頁影片的一鍵流程）。
- **Modify** `HANDOFF.md` — 收尾（Task 6）。

---

## Task 1: `resolveBackdrop()` 純函式 + registry 契約欄位

**Files:**
- Modify: `src/shell/registry.ts`（`ScreenDef` interface 加兩欄）
- Create: `src/shell/backdrop.ts`
- Test: `tests/backdrop.test.ts`

**Interfaces:**
- Produces:
  - `interface BackdropState { visible: boolean; src: string; poster: string; play: boolean }`
  - `function resolveBackdrop(def: Pick<ScreenDef,'bg'|'poster'>, reduced: boolean): BackdropState`
  - `ScreenDef.bg?: string`、`ScreenDef.poster?: string`

- [ ] **Step 1: 在 `ScreenDef` interface 加背景欄位**

修改 `src/shell/registry.ts` 的 `ScreenDef` interface（現況 line 3-12），在 `load()` 之前加兩欄：

```ts
export interface ScreenDef {
  id: string;
  title: string;
  short: string;
  color: string;
  mode: Mode;
  icon: string; // <svg> 內部 path 標記（自基準檔 rail 按鈕搬）
  bg?: string; // seamless loop 影片 URL；缺 → 無背景影片，退回點雲 canvas
  poster?: string; // reduced-motion 靜態幀 URL；由 asset-prep 腳本預先抽好、進版控
  load(): Promise<{ default: Screen }>;
}
```

不動任何既有 `SCREENS` 條目（值於 Task 3/5 才填）。

- [ ] **Step 2: 寫失敗測試**

建立 `tests/backdrop.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { resolveBackdrop } from '../src/shell/backdrop';

describe('resolveBackdrop', () => {
  it('無 bg → 隱藏影片、退回點雲', () => {
    expect(resolveBackdrop({}, false)).toEqual({ visible: false, src: '', poster: '', play: false });
  });

  it('有 bg + 允許動效 → 顯示且播放', () => {
    expect(resolveBackdrop({ bg: '/a.mp4', poster: '/a.jpg' }, false)).toEqual({
      visible: true, src: '/a.mp4', poster: '/a.jpg', play: true,
    });
  });

  it('有 bg + reduced-motion → 顯示但不播、poster 靜態', () => {
    expect(resolveBackdrop({ bg: '/a.mp4', poster: '/a.jpg' }, true)).toEqual({
      visible: true, src: '/a.mp4', poster: '/a.jpg', play: false,
    });
  });

  it('有 bg 但無 poster → poster 為空字串', () => {
    expect(resolveBackdrop({ bg: '/a.mp4' }, false)).toEqual({
      visible: true, src: '/a.mp4', poster: '', play: true,
    });
  });
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npx vitest run tests/backdrop.test.ts`
Expected: FAIL —「Failed to resolve import '../src/shell/backdrop'」或「resolveBackdrop is not a function」。

- [ ] **Step 4: 寫最小實作（先只放純函式）**

建立 `src/shell/backdrop.ts`：

```ts
/* 集中式背景影片層：全站共用單一 <video>，依 active screen 切 src。
   scrim 強度純 CSS（body[data-mode]）自動反應，本模組不碰 scrim 樣式。 */
import type { ScreenDef } from './registry';
import { prefersReduced } from '../screens/settings/storage';

export interface BackdropState {
  visible: boolean; // 顯示影片層？（false → 隱藏、露出 #harbor 點雲）
  src: string; // 影片 URL（visible=false 時為 ''）
  poster: string; // reduced-motion 靜態幀（無則 ''）
  play: boolean; // 是否播放（reduced-motion 或無 bg 時 false）
}

/** 純函式：由 ScreenDef 與 reduced-motion 旗標推導背景層狀態。 */
export function resolveBackdrop(def: Pick<ScreenDef, 'bg' | 'poster'>, reduced: boolean): BackdropState {
  if (!def.bg) return { visible: false, src: '', poster: '', play: false };
  return { visible: true, src: def.bg, poster: def.poster ?? '', play: !reduced };
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npx vitest run tests/backdrop.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 6: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 0 errors、vitest 全綠（既有 + 新增 4）、build 成功。

- [ ] **Step 7: Commit**

```bash
git add src/shell/registry.ts src/shell/backdrop.ts tests/backdrop.test.ts
git commit -m "feat(backdrop): resolveBackdrop 純函式 + ScreenDef bg/poster 契約"
```

---

## Task 2: DOM/CSS 背景層 + main.ts 接線（背景層預設 off、無回歸）

**Files:**
- Modify: `index.html`
- Modify: `src/ui/tokens.css`
- Modify: `src/shell/backdrop.ts`（補 `initBackdrop`）
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `resolveBackdrop`（Task 1）
- Produces:
  - `interface Backdrop { setScreen(def: Pick<ScreenDef,'bg'|'poster'>): void }`
  - `function initBackdrop(video: HTMLVideoElement): Backdrop`

> 本 task 完成後，尚無任何 screen 帶 `bg`（hero 仍用自己的影片，Task 3 才收編）。故 `#backdrop` 全程 `data-bg` off、隱藏，畫面與現況一致——本 task 的驗收是「基礎建設就位、零回歸」。

- [ ] **Step 1: index.html 插入背景層元素**

修改 `index.html`，在 `<div id="veil"></div>` 之後、`<aside id="rail">` 之前插入：

```html
  <video id="backdrop" muted loop playsinline preload="auto"
         disablepictureinpicture disableremoteplayback aria-hidden="true"></video>
  <div id="backdrop-scrim"></div>
```

（不加 `autoplay` 屬性——播放由 JS `safePlay()` 驅動，reduced-motion 才能可靠停在 poster。）

- [ ] **Step 2: tokens.css 加背景層樣式**

修改 `src/ui/tokens.css`，在 `#veil` 相關規則（現況 line 25-29，`body[data-mode="full"] #veil{opacity:.05;}` 之後）插入：

```css
/* ── 集中式背景影片層（2026-07-12）：在 #veil 之上、#screens 之下；scrim 強度純 CSS 依 data-mode ── */
#backdrop{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:3;pointer-events:none;display:none;}
body[data-bg="on"] #backdrop{display:block;}
#backdrop-scrim{position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;transition:opacity .3s var(--ease);
  background:linear-gradient(180deg,rgba(7,11,17,.5),rgba(7,11,17,.15) 45%,rgba(7,11,17,.62));}
body[data-bg="on"] #backdrop-scrim{opacity:1;}
/* scrim 三態：cover 最輕（電影感）/ ov 略暗（空間頁）/ doc 較重（保住文字可讀性） */
body[data-bg="on"][data-mode="cover"] #backdrop-scrim{background:linear-gradient(180deg,rgba(7,11,17,.5),rgba(7,11,17,.15) 45%,rgba(7,11,17,.62));}
body[data-bg="on"][data-mode="ov"] #backdrop-scrim{background:linear-gradient(180deg,rgba(7,11,17,.72),rgba(7,11,17,.6) 45%,rgba(7,11,17,.8));}
body[data-bg="on"][data-mode="doc"] #backdrop-scrim{background:linear-gradient(180deg,rgba(7,11,17,.86),rgba(7,11,17,.8) 50%,rgba(7,11,17,.9));}
```

（scrim 數值為起始值，Task 5/6 逐頁可微調。）

- [ ] **Step 3: backdrop.ts 補 `initBackdrop`**

在 `src/shell/backdrop.ts` 檔尾追加：

```ts
export interface Backdrop {
  setScreen(def: Pick<ScreenDef, 'bg' | 'poster'>): void;
}

export function initBackdrop(video: HTMLVideoElement): Backdrop {
  let curSrc = '';
  let cur: BackdropState = { visible: false, src: '', poster: '', play: false };

  // autoplay 政策：play() 回傳 Promise 可能被拒（省電模式等），必須 catch——
  // 失敗時 video 停在 poster 幀，對比由 backdrop-scrim 保證，不需額外 fallback UI。
  function safePlay(): void {
    video.play().catch(() => {});
  }

  function apply(): void {
    if (!cur.visible) {
      document.body.removeAttribute('data-bg');
      video.pause();
      if (curSrc) {
        video.removeAttribute('src');
        video.load(); // 停止抓 bytes、釋放解碼
        curSrc = '';
      }
      return;
    }
    document.body.setAttribute('data-bg', 'on');
    if (cur.src !== curSrc) {
      video.src = cur.src;
      curSrc = cur.src;
    }
    video.poster = cur.poster;
    if (cur.play) safePlay();
    else video.pause();
  }

  // 分頁隱藏暫停解碼；回前景且目前有 active bg 且非 reduced-motion 才恢復。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
    else if (cur.visible && cur.play) safePlay();
  });

  return {
    setScreen(def) {
      cur = resolveBackdrop(def, prefersReduced());
      apply();
    },
  };
}
```

- [ ] **Step 4: main.ts 初始化背景層並接進 onChange**

修改 `src/main.ts`：

在 import 區加（緊鄰其他 shell import）：

```ts
import { initBackdrop } from './shell/backdrop';
```

在 `const router = initRouter({...})` 之前插入：

```ts
const backdrop = initBackdrop(document.getElementById('backdrop') as HTMLVideoElement);
```

把既有 `onChange`（現況 line 64）從：

```ts
  onChange: (def) => rail.setActive(def.id),
```

改為：

```ts
  onChange: (def) => {
    rail.setActive(def.id);
    backdrop.setScreen(def);
  },
```

- [ ] **Step 5: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全數通過。

- [ ] **Step 6: 手動 smoke（dev server 開機無回歸）**

Run: `npm run dev`，瀏覽器開首頁。
Expected: hero 封面照舊（仍走 hero 自己的影片）、六頁與 twin 切換正常、console 零錯誤；DevTools 檢查 `<body>` **無** `data-bg` 屬性（因無 screen 帶 bg）、`#backdrop` 存在但 `display:none`。跑畢 Ctrl-C。

- [ ] **Step 7: Commit**

```bash
git add index.html src/ui/tokens.css src/shell/backdrop.ts src/main.ts
git commit -m "feat(backdrop): 集中背景層 DOM/CSS + initBackdrop 生命週期 + main 接線"
```

---

## Task 3: hero 收編到集中背景層

**Files:**
- Modify: `src/shell/registry.ts`（hero 條目填 `bg`/`poster` + 頂部 import）
- Modify: `src/screens/hero/hero.html`
- Modify: `src/screens/hero/hero.css`
- Modify: `src/screens/hero/index.ts`

**Interfaces:**
- Consumes: `Backdrop.setScreen`（Task 2）、`ScreenDef.bg`/`poster`（Task 1）

> 完成後 hero 改由集中層渲染背景，移除其自帶 `<video>`。任一中間步驟都不使 hero 破版：先讓 registry 帶 hero bg（此時 hero 同時有兩支影片、backdrop 那支在底、hero 自己那支在上蓋著），再移除 hero 自帶那支。

- [ ] **Step 1: registry 填入 hero 背景資產**

修改 `src/shell/registry.ts`，在檔案頂部 import 區（`import type ...` 之後）加：

```ts
import heroBg from '../screens/hero/hero-bg.mp4';
import heroPoster from '../screens/hero/hero-poster.jpg';
```

在 hero 的 `ScreenDef`（`id: 'hero'` 那筆）內，`mode: 'cover',` 之後加：

```ts
    bg: heroBg,
    poster: heroPoster,
```

- [ ] **Step 2: 移除 hero.html 的自帶影片與 scrim**

修改 `src/screens/hero/hero.html`，刪除最前面兩個元素（現況 line 1-4）：

```html
<video class="herobg" autoplay muted loop playsinline preload="auto"
       disablepictureinpicture disableremoteplayback aria-hidden="true"
       src="__BG__" poster="__POSTER__"></video>
<div class="heroscrim"></div>
```

檔案改以 `<div class="cover">` 開頭。其餘（`.cover`/`.overview`）不動。

- [ ] **Step 3: 移除 hero/index.ts 的影片生命週期**

修改 `src/screens/hero/index.ts`：

1. 刪除 import：`import { prefersReduced } from '../settings/storage';`、`import bgUrl from './hero-bg.mp4';`、`import posterUrl from './hero-poster.jpg';`
2. 刪除模組層變數：`let video: HTMLVideoElement | null = null;`
3. 刪除 `safePlay()` 函式（現況 line 54-59 整段含註解）。
4. `mount()` 內：
   - `el.innerHTML = template` 的鏈式 `.replace` 移除 `.replace('__BG__', bgUrl)` 與 `.replace('__POSTER__', posterUrl)` 兩行。
   - 刪除 `video = el.querySelector('.herobg') as HTMLVideoElement;` 及其後的 reduced-motion 區塊（`if (prefersReduced()) { video.removeAttribute('autoplay'); video.pause(); }`）。
   - 刪除整段 `document.addEventListener('visibilitychange', ...)`（現況 line 90-94，背景播放交給集中層）。
5. `show()`：刪除 `safePlay();`（保留 `queueMicrotask` 覆寫 setMode 那段——hero 兩段式仍需要）。
6. `hide()`：刪除 `video?.pause();`，`hide()` 變為空 body（保留方法簽名，router 仍會呼叫）。若 lint 不允許空 method，改為 `hide() {},`。

改後 `mount()` 的 `el.innerHTML` 應為：

```ts
    el.innerHTML = template
      .replace('<!--CHIPS-->', chipsHtml)
      .replace('__KPILINE__', kpiLine(snap.kpi))
      .replace('<!--MODULES-->', cardsHtml);
```

改後 `show()`/`hide()`：

```ts
  show() {
    // router.go() 固定「先 show() 再 applyMode(def.mode)」；setMode 延到 microtask 才不被蓋掉。
    const state = heroState;
    queueMicrotask(() => ctxRef?.setMode(state === 'ov' ? 'ov' : 'cover'));
  },

  hide() {},
```

- [ ] **Step 4: 移除 hero.css 的 .herobg / .heroscrim**

修改 `src/screens/hero/hero.css`：

1. 刪除底層影片/罩幕三條（現況 line 5-10）：
   ```css
   #s-hero .herobg{...}
   #s-hero .heroscrim{...}
   #s-hero .heroscrim::after{...}
   body[data-hero="ov"] #s-hero .heroscrim::after{opacity:1;}
   ```
2. reduced-motion 兩處對 `.heroscrim::after` 的參照移除（現況 line 60、63-64）：
   - `#s-hero .cover,#s-hero .overview,#s-hero .mcard,#s-hero .heroscrim::after{transition:none!important;}` → 去掉 `,#s-hero .heroscrim::after`。
   - `body[data-motion="reduce"] ... #s-hero .heroscrim::after{transition:none!important;}` 同樣去掉該 selector 段（保留 `.cover`/`.overview`/`.mcard`）。

hero 封面/總覽的明暗改由 `#backdrop-scrim` 的 `data-mode` cover/ov 兩態（Task 2 已定義）承接。

- [ ] **Step 5: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全綠。特別注意 tsc：hero/index.ts 移除 `prefersReduced` import 後若仍有殘留引用會報 unused/undefined——確認無殘留。

- [ ] **Step 6: 手動驗收 hero 兩段式 + reduced-motion**

Run: `npm run dev`，開首頁。
Expected:
- 封面：`#backdrop` 播放 hero-bg 影片、`<body data-bg="on" data-mode="cover">`、scrim 為 cover 輕漸層、`.herobg` 已不存在於 DOM。
- 按 Enter → 總覽：`data-mode="ov"`、scrim 轉 ov 較暗漸層、模組儀表牆 stagger 進場如常。
- 切到別頁再切回 hero：影片恢復播放。
- 系統設定開 reduce-motion（或 OS 設定）重載 → hero 顯 poster 靜態、`#backdrop` 不播放（`video.paused === true`）。
- console 零錯誤。跑畢 Ctrl-C。

- [ ] **Step 7: Commit**

```bash
git add src/shell/registry.ts src/screens/hero/hero.html src/screens/hero/hero.css src/screens/hero/index.ts
git commit -m "refactor(hero): 影片底圖收編到集中背景層、移除 hero 自帶 video/scrim"
```

---

## Task 4: poster asset-prep 腳本 + 加一頁影片的流程文件

**Files:**
- Create: `scripts/backdrop-poster.mjs`
- Modify: `README.md`

**Interfaces:**
- Produces: CLI `node scripts/backdrop-poster.mjs <screenId> [seconds]` → 產出 `src/screens/<id>/<id>-poster.jpg`

- [ ] **Step 1: 寫 poster 抽幀腳本**

建立 `scripts/backdrop-poster.mjs`：

```js
// 由某頁的 <id>-bg.mp4 抽一幀當 reduced-motion poster（非 vite build 期，開發者換 mp4 後手動跑一次）。
// 用法：node scripts/backdrop-poster.mjs <screenId> [seconds]
//   seconds 預設 0.5，避開某些 mp4 首幀為黑幀。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const id = process.argv[2];
const at = process.argv[3] ?? '0.5';
if (!id) {
  console.error('用法：node scripts/backdrop-poster.mjs <screenId> [seconds]');
  process.exit(1);
}
const mp4 = resolve('src/screens', id, `${id}-bg.mp4`);
const jpg = resolve('src/screens', id, `${id}-poster.jpg`);
if (!existsSync(mp4)) {
  console.error(`找不到影片：${mp4}`);
  process.exit(1);
}
execFileSync('ffmpeg', ['-y', '-ss', at, '-i', mp4, '-frames:v', '1', '-q:v', '3', jpg], { stdio: 'inherit' });
console.log(`已產生 poster：${jpg}`);
```

- [ ] **Step 2: 驗證腳本 guard（缺 mp4 → 非零退出）**

Run: `node scripts/backdrop-poster.mjs __nonexistent__; echo "exit=$?"`
Expected: 印出「找不到影片：…__nonexistent__-bg.mp4」且 `exit=1`。

- [ ] **Step 3: 驗證腳本抽幀（對既有 hero-bg.mp4）**

Run: `node scripts/backdrop-poster.mjs hero 0.5 && git status --short src/screens/hero/hero-poster.jpg`
Expected: 印「已產生 poster：…/hero-poster.jpg」。若 git status 顯示該檔被修改，還原以免污染 hero 既有資產：

Run: `git checkout -- src/screens/hero/hero-poster.jpg`

- [ ] **Step 4: README 加「頁面背景影片」章節**

在 `README.md` 適當位置（既有「簡報 Demo 影片錄製」章節附近）新增一節：

```markdown
## 頁面背景影片（集中式背景層）

全站背景影片由 `src/shell/backdrop.ts` 集中管理：依目前頁面的 `ScreenDef.bg` 切換單一共用 `<video>`，
缺 `bg` 的頁自動退回 `#harbor` 點雲。scrim 強度純 CSS 依 `body[data-mode]`（cover 輕 / ov 略暗 / doc 較重）。

**替某頁加背景影片（一頁一次）：**

1. 準備 seamless loop 的 mp4（H.264、約 1620×1080、< 2MB），放到 `src/screens/<id>/<id>-bg.mp4`。
2. 抽 reduced-motion poster：`node scripts/backdrop-poster.mjs <id>`（產出同目錄 `<id>-poster.jpg`）。
3. 在 `src/shell/registry.ts` 該頁 import mp4/jpg 並在其 `ScreenDef` 填 `bg`/`poster`：
   ```ts
   import xxxBg from '../screens/<id>/<id>-bg.mp4';
   import xxxPoster from '../screens/<id>/<id>-poster.jpg';
   // …該頁 def 內：
   bg: xxxBg, poster: xxxPoster,
   ```
4. 支援頁：carbon / policy / dispatch / epidemic / alert / agent。**twin 不加**（原生 WebGL 自填畫面）。
```

- [ ] **Step 5: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全綠（本 task 未動產品碼，仍跑一輪確認無回歸）。

- [ ] **Step 6: Commit**

```bash
git add scripts/backdrop-poster.mjs README.md
git commit -m "feat(backdrop): poster 抽幀腳本 + 加一頁背景影片流程文件"
```

---

## Task 5（可重複，gated on 素材）：把某一頁的背景影片接進 registry

> 每一支素材到位就跑一輪本 task；素材未到位的頁維持點雲 fallback，不阻塞其他 task。若執行本計畫時六頁素材皆未到位，本 task 全部跳過、留待日後。以下以 `<id>` 代稱，實作時代入 carbon / policy / dispatch / epidemic / alert / agent 之一。

**Files:**
- Add asset: `src/screens/<id>/<id>-bg.mp4`（使用者提供）
- Generate asset: `src/screens/<id>/<id>-poster.jpg`（腳本產生）
- Modify: `src/shell/registry.ts`

- [ ] **Step 1: 放入 mp4 素材**

把使用者提供的 mp4 存為 `src/screens/<id>/<id>-bg.mp4`。確認規格：H.264、約 1620×1080、seamless loop、< 2MB。

- [ ] **Step 2: 產生 poster**

Run: `node scripts/backdrop-poster.mjs <id>`
Expected: 產出 `src/screens/<id>/<id>-poster.jpg`。若首幀偏黑，改 `node scripts/backdrop-poster.mjs <id> 1.0` 取較後幀。

- [ ] **Step 3: registry 接線**

修改 `src/shell/registry.ts`：頂部加 import——

```ts
import <id>Bg from '../screens/<id>/<id>-bg.mp4';
import <id>Poster from '../screens/<id>/<id>-poster.jpg';
```

在該頁 `ScreenDef` 的 `mode` 之後加：

```ts
    bg: <id>Bg,
    poster: <id>Poster,
```

- [ ] **Step 4: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全綠（mp4/jpg import 由 vite/client 型別涵蓋，比照 hero 既有 import）。

- [ ] **Step 5: 手動驗收該頁**

Run: `npm run dev`，導航到該頁。
Expected: `#backdrop` 播放該頁影片、`<body data-bg="on">`、scrim 依該頁 mode（doc 較重 / ov 略暗）；文字/卡片可讀性 OK；切走該頁影片暫停、切回恢復；reduced-motion 顯 poster；console 零錯誤。若 doc 頁偏暗或 ov 頁偏亮，微調 tokens.css 對應 `data-mode` scrim 漸層值後重驗（scrim 為全頁共用，調整需一併確認其他同 mode 頁）。

- [ ] **Step 6: Commit**

```bash
git add src/screens/<id>/<id>-bg.mp4 src/screens/<id>/<id>-poster.jpg src/shell/registry.ts
git commit -m "feat(backdrop): <id> 頁掛上背景影片"
```

---

## Task 6: 全站驗收 + HANDOFF

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: 三綠燈定案**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 0、vitest 全綠（含 backdrop 4 tests）、build 成功。

- [ ] **Step 2: CDP 全站迴歸（比照歷次驗收手法）**

用獨立 headless Chrome + SwiftShader（**勿加 `--disable-gpu`**）、自起 dev server（不動使用者既有 port），逐項驗證：
- 9 頁 sweep（hero→carbon→policy→twin→dispatch→epidemic→alert→agent→settings）各自 `.screen.active` 正確 + 版面非空、鍵盤 `0`-`8` 全對映。
- hero 兩段式：cover→ov `data-mode` 切換 + scrim 對應變化、影片 currentTime 前進、切走暫停切回恢復。
- 有 bg 的頁：`<body data-bg="on">`、`#backdrop` 顯示且 src 為該頁影片；無 bg 的頁（twin + 素材未到位頁）：`data-bg` off、`#backdrop` 隱藏、`#harbor` 點雲照舊、twin WebGL context alive。
- reduced-motion：`#backdrop` `video.paused === true` 且顯 poster。
- carbon/policy 表單/輸入框內打數字不誤觸導覽（既有 bail-out 不回歸）。
- **全程 console 零 JS 例外。**

- [ ] **Step 3: 更新 HANDOFF.md**

在 `HANDOFF.md` 頂部「最後更新」與「1. 目前狀態」記錄本輪：集中式背景影片層落地、hero 收編、poster 腳本與加頁流程、哪些頁素材已到位/仍 fallback 點雲、三綠燈與 CDP 驗收結果、殘留與下一步（六頁素材逐一補、scrim 逐頁微調）。

- [ ] **Step 4: Commit**

```bash
git add HANDOFF.md
git commit -m "docs(handoff): 集中式背景影片層落地 + hero 收編收尾"
```

---

## Self-Review

**1. Spec coverage：**
- §1 決策 1（使用者提供 mp4）→ Task 5 資產契約、Task 4 流程文件。✅
- §1 決策 2（六頁、twin 除外）→ Global Constraints + Task 5 範圍 + Task 6 驗收 twin 仍點雲。✅
- §1 決策 3（集中式 + hero 收編）→ Task 2（集中層）+ Task 3（hero 收編）。✅
- §1 決策 4（scrim doc 重/ov 輕/cover 更輕）→ Task 2 Step 2 三態 CSS。✅
- §1 決策 5（poster 腳本）→ Task 4。✅
- §1 決策 6（缺 bg fallback 點雲）→ Task 1 `resolveBackdrop` visible:false 分支 + Task 2 Step 6/ Task 6 驗收。✅
- §3.1 `backdrop.ts`（resolveBackdrop + initBackdrop、單一 setScreen 介面、內部 visibilitychange）→ Task 1/2。✅
- §3.2 registry `bg?/poster?` 靜態 import URL → Task 1（欄位）+ Task 3/5（import）。✅
- §3.3 DOM/z 堆疊/scrim data-mode → Task 2 Step 1-2。✅
- §3.4 hero 收編 → Task 3。✅
- §3.5 走 onChange、不改 router.ts、不擾動 show/applyMode 同步 → Task 2 Step 4（只改 main.ts onChange）。✅
- §4 資產契約 + poster 產生時機 → Task 4/5。✅
- §5 邊界（twin 點雲、doc 可讀性、glowfx 遮蔽）→ Global Constraints + Task 5 Step 5 + Task 6。✅
- §6 測試（vitest 純函式 + CDP 渲染）→ Task 1 tests + Task 6 CDP。✅
- §7 風險（素材未到位先做接線、首載量只載 active）→ Task 5 gated 設計 + `initBackdrop` 切 src 才抓 bytes。✅

**2. Placeholder scan：** 無 TBD/TODO；`<id>` 為 Task 5 明示的可重複代稱（已說明代入哪六頁），非佔位。每個 code step 均有完整程式碼。✅

**3. Type consistency：** `BackdropState` 四欄（visible/src/poster/play）跨 Task 1 定義、Task 2 `initBackdrop` 消費一致；`resolveBackdrop(def, reduced)` 簽名一致；`Backdrop.setScreen(def)` 於 Task 2 定義、Task 2 Step 4 main.ts 消費一致；`ScreenDef.bg/poster` 於 Task 1 加、Task 3/5 賦值一致；`initBackdrop(video)` 單參數（無 scrim 參數，scrim 純 CSS）於 Task 2 定義與 main.ts 呼叫一致。✅

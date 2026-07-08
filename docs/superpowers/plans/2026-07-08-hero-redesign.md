# Hero 頁重構實作計畫（影片底圖 + 封面/總覽兩段重做）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 hero 頁底圖換成自架的抽象波浪 loop 影片，封面重做為「中置＋六模組 chips」、總覽重做為「模組儀表牆 3×2」，含轉場 choreography 與影片生命週期。

**Architecture:** 沿用快取式 router 的 Screen 契約（mount/show/hide）與 `body[data-hero]` 兩段切換機制；影片為 `#s-hero` section 內的 `<video>` 滿版底層＋gradient scrim 疊層，兩態罩幕與轉場全走 CSS，JS 只管 play/pause 生命週期。版面 CSS 全部新檔 `hero.css`（`#s-hero` 前綴），tokens.css 舊 hero 段清除。

**Tech Stack:** Vite + vanilla TS、Liquid Glass Kit（`lg-static`）、原生 HTML5 video（H.264 MP4 自架資產）、vitest、headless Chrome + CDP 驗收。

**Spec:** `docs/superpowers/specs/2026-07-08-hero-redesign-design.md`（決策表與版面規格以 spec 為準）

## Global Constraints

- 禁止 emoji；文案繁體中文 + 英文術語（來自 CLAUDE.md）。
- Commit 由使用者親自下（每個 task 結尾為檢查點）；commit 訊息不加 Claude/Anthropic 署名。
- 元件一律 Liquid Glass Kit；不手寫 `backdrop-filter`；大量重複元件用 `lg-static`。
- **禁止**對 `<video>` 套 CSS `filter`/`mix-blend-mode`/`mask`（破壞 Chromium hardware overlay path）；壓暗一律用疊加 div。
- 新版面 CSS 全部進 `src/screens/hero/hero.css`，選擇器一律 `#s-hero` 前綴；新 `@keyframes` 用 `h` 前綴命名（如 `hkbdpulse`）防跨頁衝突。
- hero 以外的頁面與 `src/shell/background.ts` 一律不動。
- 每個 task 結束必須三綠燈：`npx tsc --noEmit` 0 errors、`npx vitest run` 全綠、`npm run build` 成功。
- 瀏覽器驗證用獨立 headless Chrome + CDP（`--remote-debugging-port` + 專屬 user-data-dir + SwiftShader flags：`--use-gl=angle --use-angle=swiftshader --run-all-compositor-stages-before-draw`；**勿加** `--disable-gpu`）。
- 六模組 chips/卡片取 `SCREENS.slice(1, 7)`——registry 現有 8 筆（settings 是第 8 筆，**不**進 hero）。

---

### Task 1: OverviewSnapshot 契約改版 + mock 改寫 + hero 降過渡殼

**Files:**
- Modify: `src/data/types.ts`（OverviewSnapshot，約第 13-18 行）
- Modify: `src/data/mock/overview.json`（全面改寫）
- Modify: `src/screens/hero/index.ts`（降過渡殼）
- Delete: `src/screens/hero/ovmap.ts`
- Test: `tests/overview-mock.test.ts`（新增）

**Interfaces:**
- Consumes: `createMockExchange()`（`src/data/exchange/mock.ts`，不動）、`SCREENS`（registry，不動）。
- Produces: 新版 `OverviewSnapshot`——`kpi: { vessels; berthsUsed; berthsTotal; waitHr; co2T }`（全 number、刪 `vesselsDelta`/`waitDelta`）；`modules: { id: string; label: string; value: string; trend: number[] }[]`（新增 `trend`，固定長度 7）；`sparks`/`weekly` 欄位刪除。Task 2 的 index.ts 依此渲染。

- [ ] **Step 1: 寫失敗測試**

新增 `tests/overview-mock.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createMockExchange } from '../src/data/exchange/mock';

describe('overview mock 契約（2026-07-08 hero 改版）', () => {
  it('kpi 五欄齊全且不再有 delta/sparks/weekly 欄位', async () => {
    const o = await createMockExchange().overview.snapshot();
    expect(o.kpi).toEqual({ vessels: 128, berthsUsed: 47, berthsTotal: 62, waitHr: 3.4, co2T: 4820 });
    expect(o).not.toHaveProperty('sparks');
    expect(o).not.toHaveProperty('weekly');
  });
  it('modules 六筆依 registry 順序且 trend 固定長度 7', async () => {
    const o = await createMockExchange().overview.snapshot();
    expect(o.modules.map((m) => m.id)).toEqual(['carbon', 'policy', 'twin', 'dispatch', 'epidemic', 'alert']);
    for (const m of o.modules) {
      expect(m.trend).toHaveLength(7);
      expect(m.value.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/overview-mock.test.ts`
Expected: FAIL（`toEqual` 不符——現有 kpi 有 `vesselsDelta`/`waitDelta`；`o` 有 `sparks`/`weekly`；modules 無 `trend`）

- [ ] **Step 3: 改 `src/data/types.ts` 的 OverviewSnapshot**

```ts
export interface OverviewSnapshot {
  kpi: { vessels: number; berthsUsed: number; berthsTotal: number; waitHr: number; co2T: number };
  modules: { id: string; label: string; value: string; trend: number[] }[];
}
```

- [ ] **Step 4: 全面改寫 `src/data/mock/overview.json`**

```json
{
  "kpi": { "vessels": 128, "berthsUsed": 47, "berthsTotal": 62, "waitHr": 3.4, "co2T": 4820 },
  "modules": [
    { "id": "carbon", "label": "碳權代幣化", "value": "流通 SU 21,560", "trend": [19800, 20150, 20480, 20760, 21050, 21320, 21560] },
    { "id": "policy", "label": "政策報告", "value": "Grounding 93%", "trend": [88, 90, 89, 91, 92, 92, 93] },
    { "id": "twin", "label": "沙盤推演", "value": "在港 443 艘", "trend": [402, 418, 425, 431, 437, 440, 443] },
    { "id": "dispatch", "label": "即時派工", "value": "強降雨 80%", "trend": [20, 35, 45, 40, 60, 75, 80] },
    { "id": "epidemic", "label": "疫情追溯", "value": "橙級 1 · 追蹤 14", "trend": [6, 8, 9, 11, 12, 13, 14] },
    { "id": "alert", "label": "自動警報", "value": "今日推播 3 則", "trend": [1, 0, 2, 1, 3, 2, 3] }
  ]
}
```

（twin 的 value 由「Pareto 方案 5」改為「在港 443 艘」——trend 要能畫趨勢，方案數 5 無趨勢語意；443 對齊 twin 頁真實航跡艘數。其餘 value 沿用現值。）

- [ ] **Step 5: `src/screens/hero/index.ts` 降過渡殼、刪 `ovmap.ts`**

刪除 `src/screens/hero/ovmap.ts` 整檔（`git rm src/screens/hero/ovmap.ts`）。`index.ts` 全檔改寫為過渡殼（Task 2 會再全面重寫；此殼只求三綠燈與基本可導覽，不求版面）：

```ts
/* Hero 畫面 — Task 1 過渡殼：OverviewSnapshot 契約改版後暫時渲染最小結構，
   Task 2 依 2026-07-08 spec 全面重寫（影片底圖 + 封面 chips + 模組儀表牆）。 */
import type { Screen, ScreenCtx } from '../types';
import { SCREENS } from '../../shell/registry';

type HeroState = 'cover' | 'ov';
let heroState: HeroState = 'cover';
let ctxRef: ScreenCtx | null = null;

function setHeroState(next: HeroState): void {
  heroState = next;
  document.body.setAttribute('data-hero', next);
  ctxRef?.setMode(next === 'ov' ? 'ov' : 'cover');
}

const s: Screen = {
  async mount(el, ctx) {
    ctxRef = ctx;
    const snap = await ctx.data.overview.snapshot();
    const mods = SCREENS.slice(1, 7); // 六功能頁；第 8 筆 settings 不進 hero
    const chips = mods.map((d) => `<button data-go="${d.id}">${d.short}</button>`).join('');
    const cards = snap.modules.map((m) => `<div>${m.label}：${m.value}</div>`).join('');
    el.innerHTML =
      `<div class="cover"><h1>永續智能航港生態系</h1><div>${chips}</div>` +
      `<button class="lg lg-btn lg-btn--pill go" data-lg id="toOverview">進入戰情總覽</button></div>` +
      `<div class="overview"><div class="swrap">${cards}</div></div>`;
    el.querySelector('#toOverview')?.addEventListener('click', () => setHeroState('ov'));
    // main.ts 只在 router.current()==='hero' 時 dispatch 'hero:toggle'，綁一次即可。
    window.addEventListener('hero:toggle', () => setHeroState(heroState === 'ov' ? 'cover' : 'ov'));
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-go]');
      if (btn) location.hash = '#/' + (btn.getAttribute('data-go') as string);
    });
    document.body.setAttribute('data-hero', 'cover');
  },
  show() {
    // registry 給 hero 的 mode 是 'cover'，router 在 show() 後會 applyMode 蓋掉，
    // 故 setMode 延到 microtask（沿用既有時序修正，Task 2 重寫時保留）。
    const state = heroState;
    queueMicrotask(() => ctxRef?.setMode(state === 'ov' ? 'ov' : 'cover'));
  },
  hide() {},
};

export default s;
```

注意：`hero.html`、`TECH_TAG`、`statRow`/`initOvMap` import 隨全檔改寫自然消失；`src/screens/hero/hero.html` 檔案本 task 先留著不刪（Task 2 重寫其內容）。

- [ ] **Step 6: 三綠燈**

Run: `npx tsc --noEmit` → 0 errors
Run: `npx vitest run` → 17 檔 63 tests 全綠（新增 2）
Run: `npm run build` → 成功

- [ ] **Step 7: headless 冒煙**

啟 `npm run dev`（或沿用既有埠），headless Chrome 開 `#/`：過渡殼 cover 顯示、點 chip 跳對應頁、`0` 鍵返回、console 無 JS 例外。

- [ ] **Step 8: 檢查點——請使用者 commit**

建議訊息：`feat(hero): OverviewSnapshot 契約改版（modules.trend）+ mock 改寫 + hero 降過渡殼`

---

### Task 2: 影片資產 + hero.html / hero.css / index.ts 全面重寫 + tokens.css 清舊

**Files:**
- Create: `src/screens/hero/hero-bg.mp4`、`src/screens/hero/hero-poster.jpg`（資產）
- Create: `src/screens/hero/hero.css`
- Modify: `src/screens/hero/hero.html`（全檔重寫）
- Modify: `src/screens/hero/index.ts`（全檔重寫）
- Modify: `src/ui/tokens.css`（清 hero 舊段）

**Interfaces:**
- Consumes: Task 1 的 `OverviewSnapshot`（`kpi` 五欄、`modules[].trend`）；`SCREENS.slice(1, 7)`（`ScreenDef.id/short/color`）；`prefersReduced()`（`../settings/storage`）；tokens.css 共用類 `.swrap`/`.src.live`/`.anim`（`--d` stagger，reduced-motion 三通道已內建）。
- Produces: 完整新版 hero screen（Task 3 驗收對象）。無其他模組消費 hero 內部符號。

- [ ] **Step 1: 資產進 repo**

影片已於 brainstorming 階段自 Mux HLS 下載重封（H.264 High yuv420p、1620×1080@30、10.18s、306 幀、約 1.4MB、無縫 loop 已驗證）：

```bash
cp "/private/tmp/claude-501/-Users-charles88-Desktop-2026------------iMarine-FrontEnd/3b54e14c-6cbc-4fea-8aaf-f31e36d74003/scratchpad/hero-bg-src.mp4" \
   "src/screens/hero/hero-bg.mp4"
# 若 scratchpad 已被清（session 過期），重新下載：
# ffmpeg -y -i "https://stream.mux.com/NcU3HlHeF7CUL86azTTzpy3Tlb00d6iF3BmCdFslMJYM.m3u8" -map 0:v:0 -c copy src/screens/hero/hero-bg.mp4
ffmpeg -y -i src/screens/hero/hero-bg.mp4 -vf "select=eq(n\,0)" -frames:v 1 -q:v 3 src/screens/hero/hero-poster.jpg
```

驗證：`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,duration -of default=noprint_wrappers=1 src/screens/hero/hero-bg.mp4` → `h264 / 1620 / 1080 / 10.18` 左右；`ls -la` 兩檔存在、mp4 約 1.4MB。

- [ ] **Step 2: 重寫 `src/screens/hero/hero.html`**

```html
<video class="herobg" autoplay muted loop playsinline preload="auto"
       disablepictureinpicture disableremoteplayback aria-hidden="true"
       src="__BG__" poster="__POSTER__"></video>
<div class="heroscrim"></div>

<div class="cover">
  <div class="k anim" style="--d:0s">iMARINE ECOSYSTEM · PORT OF KAOHSIUNG</div>
  <h1 class="anim" style="--d:.08s">永續智能航港生態系</h1>
  <div class="sub anim" style="--d:.16s">碳權交易 × AI 政策決策 × 數位孿生 × 第一線作業安全</div>
  <div class="hchips anim" style="--d:.24s"><!--CHIPS--></div>
  <button class="hcta anim" id="toOverview" style="--d:.32s"><span class="hkbd">ENTER</span>進入戰情總覽</button>
  <div class="comp anim" style="--d:.4s">交通部航港局 · 第 6 屆航港大數據創意應用競賽</div>
</div>

<div class="overview">
  <div class="swrap">
    <header class="ovhead">
      <h1>高雄港即時生態快照</h1>
      <span class="src live"><i></i>LIVE</span>
      <span class="ovspacer"></span>
      <span class="kpiline">__KPILINE__</span>
    </header>
    <div class="modwall"><!--MODULES--></div>
  </div>
</div>
```

- [ ] **Step 3: 新增 `src/screens/hero/hero.css`**

設計取捨（預答 review）：chips 與 CTA 刻意**不用** Kit 玻璃（`lg`/`lg-btn`），走半透明實色——影片底圖上的 backdrop-filter 每幀重算 blur，spec §8 明訂克制；模組卡用 `lg lg-static`（無 backdrop-filter）符合 Kit 大量重複元件規範。已知可接受邊界：在 hero 頁停留期間於別分頁改 settings 的 reduceMotion 開關，影片要到下次 hide/show 循環才會停（settings 頁切換本身必經 hide()，實務上不會發生）。

```css
/* Hero — 影片底圖兩段式（2026-07-08 spec）。全部 #s-hero 前綴；
   罩幕兩態走 body[data-hero]；禁止對 video 套 filter（hardware overlay）。 */

/* ── 底層：影片 + 罩幕 ── */
#s-hero .herobg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:0;pointer-events:none;}
#s-hero .heroscrim{position:absolute;inset:0;z-index:1;pointer-events:none;
  background:linear-gradient(180deg,rgba(7,11,17,.5),rgba(7,11,17,.15) 45%,rgba(7,11,17,.62));}
#s-hero .heroscrim::after{content:'';position:absolute;inset:0;background:rgba(7,11,17,.66);
  opacity:0;transition:opacity .25s var(--ease);}
body[data-hero="ov"] #s-hero .heroscrim::after{opacity:1;}

/* ── 封面 ── */
#s-hero .cover{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:24px;text-align:center;transition:opacity .28s var(--ease),transform .28s var(--ease);}
body[data-hero="ov"] #s-hero .cover{opacity:0;transform:translateY(-24px);pointer-events:none;}
#s-hero .cover .k{font-size:12px;letter-spacing:.34em;color:var(--ink-60);font-family:var(--mono);margin-bottom:20px;}
#s-hero .cover h1{font-size:clamp(44px,9vh,104px);margin:0 0 16px;font-weight:800;letter-spacing:.06em;line-height:1.15;
  text-wrap:balance;background:linear-gradient(180deg,#fff,rgba(255,255,255,.72));
  -webkit-background-clip:text;background-clip:text;color:transparent;}
#s-hero .cover .sub{color:var(--ink-60);font-size:15.5px;letter-spacing:.12em;margin-bottom:34px;}
#s-hero .hchips{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:56rem;}
#s-hero .hchip{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;cursor:pointer;
  border:1px solid var(--hair);background:rgba(255,255,255,.06);color:var(--ink-90);font-size:13px;font-family:inherit;
  outline:1px solid transparent;transition:transform .4s var(--ease),outline-color .4s var(--ease);}
#s-hero .hchip:hover{transform:translateY(-3px);outline-color:var(--mc);}
#s-hero .hchip i{width:7px;height:7px;border-radius:50%;background:var(--mc);box-shadow:0 0 8px var(--mc);}
#s-hero .hcta{margin-top:42px;display:inline-flex;align-items:center;gap:10px;padding:10px 22px;border-radius:999px;cursor:pointer;
  border:1px solid var(--hair);background:rgba(255,255,255,.07);color:var(--ink-90);font-size:13.5px;font-family:inherit;}
#s-hero .hkbd{padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.3);font-family:var(--mono);font-size:11px;
  letter-spacing:.08em;animation:hkbdpulse 2.4s ease-in-out infinite;}
@keyframes hkbdpulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0);}50%{box-shadow:0 0 12px 0 rgba(255,255,255,.28);}}
#s-hero .cover .comp{margin-top:30px;font-size:11px;color:var(--ink-40);font-family:var(--mono);letter-spacing:.22em;}

/* ── 總覽（模組儀表牆）── */
#s-hero .overview{position:absolute;inset:0;z-index:2;overflow-y:auto;opacity:0;transform:translateY(20px);pointer-events:none;
  transition:opacity .5s var(--ease),transform .5s var(--ease);}
body[data-hero="ov"] #s-hero .overview{opacity:1;transform:none;pointer-events:auto;transition-delay:.15s;}
#s-hero .overview .swrap{display:flex;flex-direction:column;min-height:100%;}
#s-hero .ovhead{display:flex;align-items:center;gap:14px;margin-bottom:18px;}
#s-hero .ovhead h1{font-size:24px;margin:0;font-weight:700;}
#s-hero .ovspacer{flex:1;}
#s-hero .kpiline{font-family:var(--mono);font-size:13px;color:var(--ink-60);letter-spacing:.06em;white-space:nowrap;}
#s-hero .modwall{flex:1;display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:minmax(180px,1fr);gap:14px;}
#s-hero .mcard{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:10px;padding:20px 22px;
  border-radius:18px;cursor:pointer;border:none;text-align:left;font-family:inherit;color:var(--ink-90);
  outline:1px solid transparent;transition:transform .35s var(--ease),outline-color .35s var(--ease);
  opacity:0;transform:translateY(14px);}
body[data-hero="ov"] #s-hero .mcard{opacity:1;transform:none;
  transition:opacity .5s var(--ease),transform .5s var(--ease),outline-color .35s var(--ease);
  transition-delay:calc(.2s + var(--i) * .08s);}
body[data-hero="ov"] #s-hero .mcard:hover{transform:translateY(-4px);outline-color:var(--mc);transition-delay:0s;}
#s-hero .mcard .t{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;}
#s-hero .mcard .t i{width:8px;height:8px;border-radius:50%;background:var(--mc);box-shadow:0 0 10px var(--mc);}
#s-hero .mcard .v{font-size:clamp(26px,3.4vh,34px);font-family:var(--mono);font-weight:600;letter-spacing:-.01em;}
#s-hero .mcard .tr{width:100%;height:26px;overflow:visible;}
#s-hero .mcard .tr polyline{fill:none;stroke:var(--mc);stroke-width:2;opacity:.65;stroke-linecap:round;stroke-linejoin:round;}

/* reduced-motion：轉場直達終態（.anim 三通道 tokens.css 已內建，這裡補 hero 專屬過場） */
@media(prefers-reduced-motion:reduce){
  #s-hero .cover,#s-hero .overview,#s-hero .mcard,#s-hero .heroscrim::after{transition:none!important;}
  #s-hero .hkbd{animation:none;}
}
body[data-motion="reduce"] #s-hero .cover,body[data-motion="reduce"] #s-hero .overview,
body[data-motion="reduce"] #s-hero .mcard,body[data-motion="reduce"] #s-hero .heroscrim::after{transition:none!important;}
body[data-motion="reduce"] #s-hero .hkbd{animation:none;}

/* 窄螢幕降級（demo 以 16:9 為準，僅保底不破版） */
@media(max-width:900px){
  #s-hero .modwall{grid-template-columns:1fr 1fr;}
  #s-hero .kpiline{display:none;}
}
```

- [ ] **Step 4: 重寫 `src/screens/hero/index.ts`**

```ts
/* Hero 畫面 — 兩段式：影片底圖封面 COVER ⇄ 模組儀表牆 OVERVIEW（2026-07-08 spec）。
   影片：<video> 滿版底層 + gradient scrim（兩態走 body[data-hero]，CSS 過場）；
   JS 只管 play/pause 生命週期（show/hide + visibilitychange）與 reduced-motion 靜態降級。
   封面六 chips 與總覽六卡皆由 SCREENS.slice(1, 7) 動態生成（settings 第 8 筆不進 hero），
   同色點同順序＝轉場跨段錨點。 */
import type { Screen, ScreenCtx } from '../types';
import template from './hero.html?raw';
import { SCREENS, type ScreenDef } from '../../shell/registry';
import type { OverviewSnapshot } from '../../data/types';
import { prefersReduced } from '../settings/storage';
import bgUrl from './hero-bg.mp4';
import posterUrl from './hero-poster.jpg';
import './hero.css';

type HeroState = 'cover' | 'ov';
let heroState: HeroState = 'cover';
let ctxRef: ScreenCtx | null = null;
let video: HTMLVideoElement | null = null;
let sectionEl: HTMLElement | null = null;

function chip(def: ScreenDef): string {
  return `<button class="hchip" data-go="${def.id}" style="--mc:${def.color}"><i></i>${def.short}</button>`;
}

// trend（長度 7）→ 100×24 viewBox 的 polyline points（首尾貼齊、上下留 2px 邊）
function sparkPoints(trend: number[]): string {
  const min = Math.min(...trend);
  const span = Math.max(...trend) - min || 1;
  return trend
    .map((v, i) => `${((i / (trend.length - 1)) * 100).toFixed(1)},${(22 - ((v - min) / span) * 20).toFixed(1)}`)
    .join(' ');
}

function modCard(def: ScreenDef, m: OverviewSnapshot['modules'][number], i: number): string {
  return (
    `<button class="mcard lg lg-static" data-go="${def.id}" style="--mc:${def.color};--i:${i}">` +
    `<span class="t"><i></i>${def.short}</span>` +
    `<span class="v">${m.value}</span>` +
    `<svg class="tr" viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="${sparkPoints(m.trend)}"/></svg>` +
    `</button>`
  );
}

function kpiLine(k: OverviewSnapshot['kpi']): string {
  return `${k.vessels} 艘 · ${k.berthsUsed}/${k.berthsTotal} 席 · ${k.waitHr.toFixed(1)} hr · ${k.co2T.toLocaleString('en-US')} t`;
}

function setHeroState(next: HeroState): void {
  heroState = next;
  document.body.setAttribute('data-hero', next);
  ctxRef?.setMode(next === 'ov' ? 'ov' : 'cover');
}

// autoplay 政策：play() 回傳 Promise 可能被拒（省電模式等），必須 catch——失敗時
// video 停在 poster 幀，版面對比不受影響（罩幕保證），不需額外 fallback UI。
function safePlay(): void {
  if (!video || prefersReduced()) return;
  video.play().catch(() => {});
}

const s: Screen = {
  async mount(el, ctx) {
    ctxRef = ctx;
    sectionEl = el;
    const snap = await ctx.data.overview.snapshot();
    const mods = SCREENS.slice(1, 7); // 六功能頁；settings 不進 hero
    const chipsHtml = mods.map(chip).join('');
    const cardsHtml = mods
      .map((def, i) => {
        const m = snap.modules.find((x) => x.id === def.id);
        return m ? modCard(def, m, i) : '';
      })
      .join('');

    el.innerHTML = template
      .replace('__BG__', bgUrl)
      .replace('__POSTER__', posterUrl)
      .replace('<!--CHIPS-->', chipsHtml)
      .replace('__KPILINE__', kpiLine(snap.kpi))
      .replace('<!--MODULES-->', cardsHtml);

    video = el.querySelector('.herobg') as HTMLVideoElement;
    // reduced-motion：不 autoplay、顯示 poster 靜態圖（prefersReduced 已含 settings 開關）。
    if (prefersReduced()) {
      video.removeAttribute('autoplay');
      video.pause();
    }
    // 分頁隱藏暫停解碼；回前景且本頁 active 才恢復（切到別頁時交給 hide() 管）。
    document.addEventListener('visibilitychange', () => {
      if (!video) return;
      if (document.hidden) video.pause();
      else if (sectionEl?.classList.contains('active')) safePlay();
    });

    el.querySelector('#toOverview')?.addEventListener('click', () => setHeroState('ov'));
    // main.ts 只在 router.current()==='hero' 時 dispatch 'hero:toggle'，綁一次即可。
    window.addEventListener('hero:toggle', () => setHeroState(heroState === 'ov' ? 'cover' : 'ov'));
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-go]');
      if (btn) location.hash = '#/' + (btn.getAttribute('data-go') as string);
    });

    document.body.setAttribute('data-hero', 'cover');
  },

  show() {
    // router.go() 固定「先 show() 再 applyMode(def.mode)」且 registry 給 hero 的 mode
    // 是 'cover'——setMode 延到 microtask 才不會被蓋掉（沿用既有時序修正）。
    const state = heroState;
    queueMicrotask(() => ctxRef?.setMode(state === 'ov' ? 'ov' : 'cover'));
    safePlay();
  },

  hide() {
    video?.pause();
  },
};

export default s;
```

- [ ] **Step 5: tokens.css 清 hero 舊段（先 grep 再刪，防跨頁洩漏）**

`/* ═══ Hero ═══ */` 段（約 103-138 行）逐條處理。**每刪一個類名前先 grep 全 repo 確認無其他頁引用**：

```bash
grep -rn "class=\"[^\"]*cover\|\.cover\b" src/ --include="*.ts" --include="*.html" --include="*.css" | grep -v "screens/hero" | grep -v "hero.css"
# 對以下每個類名重複：.entries .entry .overview .ov-head .mapbox .tagrow .modrow .modcard .stack
# 注意：搜 mapbox 會命中 epidemic/worldmap.ts 與 settings 的 mapbox-gl「函式庫」字樣——
# 那是 library 名非 CSS 類名，不算引用（2026-07-08 計畫撰寫時已預跑：九個類名皆無跨頁 CSS 使用）。
```

- 刪除：`.cover`（含 `.k`/`h1`/`.sub`/`.go`/`.comp` 子規則）、`.entries`、`.entry`（含 197-199 行的 outline 補充規則）、`body[data-hero="ov"] .cover`、`.overview`、`body[data-hero="ov"] .overview`、`.ov-head`、`.mapbox`（含 `.tagrow`/`.cap`）、`.modrow`、`.modcard`（含 `.t`/`.v`）。
- 保留：`#s-hero{display:none;}`/`#s-hero.active{display:block;}` 兩行與 `/* ═══ Hero ═══ */` 段標（無害）、`.swrap`/`.stats4`/`.stack`（若 grep 顯示其他頁仍用——`.stats4` 是 statRow 共用類**必留**；`.stack` 若只有 hero 用則刪）。
- 窄螢幕 media query（約 224 行）`.cols,.stats4,.modrow{grid-template-columns:1fr;}` → 移除 `.modrow`，改為 `.cols,.stats4{grid-template-columns:1fr;}`。

- [ ] **Step 6: 三綠燈**

Run: `npx tsc --noEmit` → 0 errors（mp4/jpg import 由 `vite/client` 型別涵蓋，tsconfig 已設）
Run: `npx vitest run` → 17 檔 63 tests 全綠
Run: `npm run build` → 成功；確認 `dist/assets/` 有 `hero-bg-*.mp4`（非 inline base64）：`ls dist/assets/ | grep mp4`

- [ ] **Step 7: CDP 逐項驗證（headless Chrome，真實渲染）**

啟獨立 headless Chrome（SwiftShader flags、專屬 user-data-dir、`--remote-debugging-port`），自寫 CDP 腳本逐項斷言：

1. 封面：`.herobg` 存在且 `!video.paused`、兩次取樣 `currentTime` 前進；kicker/大標/副標/六 chips/CTA/署名全渲染；`body[data-hero]==='cover'`。
2. chips：六顆、色點 background 各為 registry 色；點 `[data-go="carbon"]` → `location.hash==='#/carbon'`（六顆抽兩顆驗）。
3. Enter 轉場：`dispatchEvent(new Event('hero:toggle'))` 或 CDP 鍵盤 Enter → `data-hero==='ov'`、`.cover` computed `opacity` 趨近 0、六 `.mcard` 依序變 `opacity:1`（取樣兩個時間點驗 stagger）、`.heroscrim::after` opacity → 1。
4. 總覽：標題/LIVE chip/kpiline 字串 `128 艘 · 47/62 席 · 3.4 hr · 4,820 t`、六卡 value/trend polyline points 非空、卡點擊跳頁。
5. 生命週期：切到 `#/carbon` → `video.paused===true`；以 `0` 鍵（CDP `Input.dispatchKeyEvent`）切回 hero → 恢復播放且仍在總覽態（`data-hero==='ov'`）。
6. reduced-motion（CDP `Emulation.setEmulatedMedia`）：重載後 `video.paused===true`、poster 顯示、封面/總覽切換直達終態、版面完整。
7. console 全程零 JS 例外。

截圖三張存 scratch：封面、轉場中、總覽。

- [ ] **Step 8: 檢查點——請使用者 commit**

建議訊息：`feat(hero): 影片底圖 + 封面 chips + 模組儀表牆全面重寫（hero.css/資產/tokens 清舊）`

---

### Task 3: 全站迴歸驗收 + HANDOFF 收尾

**Files:**
- Modify: `HANDOFF.md`（第 1 節現況 + 第 4 節下一步）

**Interfaces:**
- Consumes: Task 2 完成的 hero screen。
- Produces: 驗收證據與交接文件；無程式碼變更（發現缺陷回報、不自行修——依 SDD 規約交 review 決策）。

- [ ] **Step 1: 三綠燈重跑**

Run: `npx tsc --noEmit` / `npx vitest run` / `npm run build` → 全綠。

- [ ] **Step 2: 8 頁全站迴歸（CDP）**

hero（封面→總覽）→ carbon → policy → twin（WebGL 有畫面）→ dispatch → epidemic → alert → settings → 回 hero，逐頁 `.screen.active` 正確、console 全程零 JS 例外。特別驗：
- 鍵盤 `0`/`1`-`7`/`Enter` 全部正常；carbon modal 輸入框打數字不跳頁（既有 bail-out 迴歸）。
- hero 切走再切回：影片恢復播放、總覽態保留。
- tokens.css 清舊的跨頁洩漏補償：檢查 carbon/policy/dispatch/epidemic/alert/settings 各頁版面無異常（前例：`.fchip .n`、`.gbar` 都曾被 tokens 清理誤傷——本次刪的 `.modcard`/`.entry`/`.overview` 等類名若有他頁同名使用，Step 5 的 grep 應已攔下，這裡實機再確認一輪）。
- reduced-motion 全站模擬一輪：hero poster 靜態、其餘頁完整渲染。

- [ ] **Step 3: 更新 `HANDOFF.md`**

第 1 節加 hero 改版現況段（比照 alert 段格式：定位/成果檔案/驗收誠實分野/spec 與 plan 路徑）；第 4 節「下一步」改為 hero 改版完結後的狀態（最終 whole-branch review → 使用者實機驗收 → finishing）。

- [ ] **Step 4: 檢查點——請使用者 commit**

建議訊息：`docs(hero): 全站驗收 + HANDOFF 收尾`

---

## Self-Review 紀錄（含 codebase 實查）

- Spec 覆蓋：§3.1 封面（Task 2 Step 2/3）、§3.2 總覽（Step 2/3/4）、§3.3 轉場（hero.css data-hero 過場 + stagger）、§4 影片機制（資產/video 屬性/scrim/生命週期/RM 皆入 Task 2）、§5 契約（Task 1）、§6 檔案（三 task 合計對齊）、§7 驗收（Task 2 Step 7 + Task 3）、§8 風險（罩幕對比/lg-static 紀律入 CSS）。無缺口。
- 型別一致：`OverviewSnapshot['modules'][number]` 含 `trend`（Task 1 定義、Task 2 消費）；`kpiLine` 只用五欄 kpi；`SCREENS.slice(1, 7)` 兩處一致（settings 第 8 筆不進 hero）。
- 無占位詞；所有程式碼步驟皆附完整內容。
- **Codebase 實查（計畫撰寫當下已預跑驗證）**：(1) `tests/` 無任何檔案引用 overview 的 `sparks`/`weekly`/delta 欄位——Task 1 只需新增 `overview-mock.test.ts`，vitest 現況 16 檔 61 tests 全綠，改版後 17 檔 63 的預期成立；(2) `.modcard`/`.entry`/`.entries`/`.overview`/`.ov-head`/`.mapbox`/`.tagrow`/`.modrow`/`.stack` 九個待刪類名經 grep 全 repo 確認無 hero 以外使用（mapbox 命中皆為 mapbox-gl 函式庫字樣）；(3) `.anim`/`--d` stagger 與 reduced-motion 三通道（media query/`data-motion`/`data-anim`）皆為 tokens.css 既有全域機制，hero.css 直接複用；(4) `tsconfig.json` 已設 `"types": ["vite/client"]`，mp4/jpg asset import 型別有涵蓋。
- 已知可接受邊界與設計取捨（chips/CTA 不用 Kit 玻璃的理由、settings reduceMotion 中途切換的時效）記於 Task 2 Step 3 preamble。

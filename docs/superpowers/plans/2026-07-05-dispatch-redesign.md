# Dispatch 頁改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 dispatch 頁從「逐 10 分鐘熱區網格」改版為「ConvLSTM 單一預測 + 作業燈號矩陣 + 可解釋派工指令」的情境驅動頁。

**Architecture:** 資料契約改為三情境（stable/rain/typhoon）的 `DispatchScenario`，UI 一切從當前情境重渲染；`conclusion.ts` 純函式解析結論標記（可測）；screen 膠合層管四種互動（情境切換／時間軸游標／規則展開／更新倒數）。視覺與互動基準：`docs/preview/preview-dispatch-redesign.html`（36 斷言已驗收）與 spec `docs/superpowers/specs/2026-07-05-dispatch-redesign-design.md`。

**Tech Stack:** Vite + vanilla TS、Liquid Glass Kit（既有 vendored 兩檔）、vitest。

## Global Constraints

- 元件一律 Liquid Glass Kit；不手寫 `backdrop-filter`；小型/大量重複元件（矩陣格、指令卡）用 `lg-static`。
- 色彩紀律：可作業 `#35E0A6`（`var(--teal)`）／戒備 `#F5A54A`（`var(--amber)`）／停工 `#F0648C`（`var(--rose)`），全頁嚴格同義；停工格帶 ✕、戒備格帶 ! 形狀冗餘。
- dispatch 模組色 `#F5A54A`；`ov` 頁（`.swrap` 版心）；`source:'mock'`。
- 新 CSS 全部以 `#s-dispatch` 前綴 scope（比照 policy 前例）。
- 禁止 emoji；文案繁中 + 英文術語。
- 每個 task 結尾三綠燈：`npx tsc --noEmit` 0 errors、`npx vitest run` 全 PASS、`npm run build` 成功。
- **每個 task 的 Commit 檢查點由使用者自行 commit（專案鐵則：不代打 `git commit`）。**
- 互動細節有疑義時，以 `docs/preview/preview-dispatch-redesign.html` 的行為為準（它是使用者驗收過的基準檔）。

---

### Task 1: conclusion.ts — 結論標記解析（TDD）

**Files:**
- Create: `src/screens/dispatch/conclusion.ts`
- Test: `tests/dispatch-conclusion.test.ts`

**Interfaces:**
- Consumes: 無（純函式，零依賴）。
- Produces: `parseConclusion(s: string): string` — 把 `{{stop:文字}}` 換成 `<em>文字</em>`、`{{add:文字}}` 換成 `<u>文字</u>`，其餘原樣。Task 4 的 `renderHero()` 會呼叫它。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/dispatch-conclusion.test.ts
import { describe, it, expect } from 'vitest';
import { parseConclusion } from '../src/screens/dispatch/conclusion';

describe('parseConclusion', () => {
  it('stop 標記轉 <em>、add 標記轉 <u>', () => {
    expect(parseConclusion('A — {{stop:橋式機停工}}，{{add:綁解纜加派 2 員}}')).toBe(
      'A — <em>橋式機停工</em>，<u>綁解纜加派 2 員</u>',
    );
  });
  it('無標記時原樣返回', () => {
    expect(parseConclusion('全作業線正常運轉')).toBe('全作業線正常運轉');
  });
  it('同型標記可出現多次、解析後無殘留大括號', () => {
    const out = parseConclusion('{{stop:甲}}與{{stop:乙}}');
    expect(out).toBe('<em>甲</em>與<em>乙</em>');
    expect(out).not.toContain('{{');
  });
});
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/dispatch-conclusion.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 最小實作**

```ts
// src/screens/dispatch/conclusion.ts
/* 派工結論句標記解析 — {{stop:..}} 玫紅強調、{{add:..}} 綠強調（spec §4）。
   純函式、零 DOM 依賴，仿 policy 的 {{c:..}} 手法拆出可測模組。 */
export function parseConclusion(s: string): string {
  return s
    .replace(/\{\{stop:([^}]*)\}\}/g, '<em>$1</em>')
    .replace(/\{\{add:([^}]*)\}\}/g, '<u>$1</u>');
}
```

- [ ] **Step 4: 跑測試確認 GREEN**

Run: `npx vitest run tests/dispatch-conclusion.test.ts`
Expected: 3 PASS。再跑全套 `npx vitest run` 確認無回歸、`npx tsc --noEmit` 0 errors。

- [ ] **Step 5: 檢查點（使用者 commit）**

---

### Task 2: 資料契約 + 三情境 mock JSON（TDD）+ 舊 screen 降為過渡殼

**Files:**
- Modify: `src/data/types.ts`（`DispatchSnapshot` 區段全換）
- Modify: `src/data/mock/dispatch.json`（全面改寫）
- Modify: `src/screens/dispatch/index.ts`（暫時降為最小殼，Task 3 重建）
- Delete: `src/screens/dispatch/heat.ts`
- Test: `tests/dispatch-mock.test.ts`

**Interfaces:**
- Consumes: `createMockExchange()`（既有，`src/data/exchange/mock.ts`，無需改動——provider 泛型直接吃新型別）。
- Produces: `DispatchSnapshot { scenarios: DispatchScenario[] }` 與子型別 `DispatchScenario`／`CwaWindow`／`OpRow`／`DispatchCard`／`RainLevel`／`OpStatus`／`RuleTag`（named exports，Task 3-6 的 index.ts import 使用）。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/dispatch-mock.test.ts
import { describe, it, expect } from 'vitest';
import { createMockExchange } from '../src/data/exchange/mock';

const OPS = ['crane', 'grain', 'coal', 'tanker', 'pilot', 'mooring', 'yard'];
const ST = ['ok', 'warn', 'stop'];
const RAIN = ['無', '小雨', '大雨', '豪雨', '大豪雨', '超大豪雨'];

describe('dispatch mock 契約', () => {
  it('3 情境（stable/rain/typhoon），每情境 7 種作業、順序固定', async () => {
    const s = await createMockExchange().dispatch.snapshot();
    expect(s.scenarios.map((x) => x.id)).toEqual(['stable', 'rain', 'typhoon']);
    for (const sc of s.scenarios) expect(sc.ops.map((o) => o.id)).toEqual(OPS);
  });
  it('燈號/雨量枚舉合法；CWA 固定 +3h/+6h 兩窗', async () => {
    const s = await createMockExchange().dispatch.snapshot();
    for (const sc of s.scenarios) {
      expect(RAIN).toContain(sc.nowcast.rainLevel);
      expect(sc.cwa.map((w) => w.window)).toEqual(['+3h', '+6h']);
      for (const w of sc.cwa) expect(RAIN).toContain(w.rainLevel);
      for (const o of sc.ops) {
        expect(ST).toContain(o.now.status);
        expect(ST).toContain(o.cwa3);
        expect(ST).toContain(o.cwa6);
        expect(o.rules.length).toBeGreaterThanOrEqual(1);
        for (const r of o.rules) expect(['official', 'industry']).toContain(r.tag);
      }
    }
  });
  it('卡片 2-5 張、opId 都存在於 ops；結論標記可解析無殘留', async () => {
    const s = await createMockExchange().dispatch.snapshot();
    for (const sc of s.scenarios) {
      expect(sc.cards.length).toBeGreaterThanOrEqual(2);
      expect(sc.cards.length).toBeLessThanOrEqual(5);
      for (const c of sc.cards) expect(OPS).toContain(c.opId);
      expect(sc.conclusion.replace(/\{\{(stop|add):[^}]*\}\}/g, '')).not.toContain('{{');
    }
  });
  it('主秀 rain 情境：crane/grain 停工、mooring 加派（warn）、+6h 全面恢復綠', async () => {
    const s = await createMockExchange().dispatch.snapshot();
    const rain = s.scenarios[1];
    expect(rain.ops.find((o) => o.id === 'crane')!.now.status).toBe('stop');
    expect(rain.ops.find((o) => o.id === 'grain')!.now.status).toBe('stop');
    expect(rain.ops.find((o) => o.id === 'mooring')!.now.status).toBe('warn');
    for (const o of rain.ops) expect(o.cwa6).toBe('ok');
  });
});
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/dispatch-mock.test.ts`
Expected: FAIL（舊 JSON 無 `scenarios` 欄位）。

- [ ] **Step 3: 改寫 `src/data/types.ts` 的 DispatchSnapshot 區段**

把既有的
```ts
export interface DispatchSnapshot {
  metrics: { csi: number; pod: number; far: number };
  winds: number[]; rains: number[];                      // 各 10 筆，t=0..90 step10
  suggestions: { level: 'rose' | 'amber' | 'ok'; title: string; body: string; why: string }[];
}
```
整段換成：
```ts
// ── dispatch（2026-07-05 spec 改版：ConvLSTM 90 分鐘單一預測 + 三情境劇本）──
export type RainLevel = '無' | '小雨' | '大雨' | '豪雨' | '大豪雨' | '超大豪雨';
export type OpStatus = 'ok' | 'warn' | 'stop';
export type RuleTag = 'official' | 'industry';
export interface CwaWindow { window: '+3h' | '+6h'; rainLevel: RainLevel; beaufort: number }
export interface OpRow {
  id: 'crane' | 'grain' | 'coal' | 'tanker' | 'pilot' | 'mooring' | 'yard';
  name: string;
  now: { status: OpStatus; action: string };   // ConvLSTM 段：燈色 + 格內動作字
  cwa3: OpStatus; cwa6: OpStatus;              // CWA 段：只有燈色
  rules: { text: string; basis: string; tag: RuleTag }[];
}
export interface DispatchCard {
  opId: string; title: string; body: string; level: OpStatus;
  badge?: { text: string; urgent: boolean };
}
export interface DispatchScenario {
  id: 'stable' | 'rain' | 'typhoon';
  label: string;
  nowcast: { rainLevel: RainLevel; beaufort: number; windAvg: number; windGust: number };
  conclusion: string;                          // 含 {{stop:..}}/{{add:..}} 標記
  cwa: [CwaWindow, CwaWindow];
  ops: OpRow[];                                // 固定 7 筆
  cards: DispatchCard[];                       // 2-5 張
  metrics: { csi: number; pod: number; far: number };
}
export interface DispatchSnapshot { scenarios: DispatchScenario[] }  // 固定 3 筆
```

- [ ] **Step 4: 全面改寫 `src/data/mock/dispatch.json`**

內容 = 基準檔 `docs/preview/preview-dispatch-redesign.html` 內 `var SCN = {...}` 的三情境資料原樣轉成 JSON（`{"scenarios":[{...stable},{...rain},{...typhoon}]}`，物件轉陣列、補 `id` 欄位；`label`/`nowcast`/`conclusion`/`cwa`/`ops`/`cards`/`metrics` 逐欄照抄，不改任何文案與數字）。三情境數值總表（與 spec §6 一致）：

| | stable | rain | typhoon |
|---|---|---|---|
| rainLevel | 無 | 大雨 | 豪雨 |
| beaufort / windAvg / windGust | 4 / 6.5 / 8.1 | 6 / 12.6 / 14.2 | 7 / 14.5 / 19.6 |
| ops now | 7 列全 ok「正常」 | crane stop「停工」、grain stop「停裝關艙」、coal warn「戒備」、tanker warn「續作+監控」、pilot warn「加派拖船」、mooring warn「加派 +2」、yard ok「正常」 | crane stop「停工+錨定」、grain stop「停裝」、coal stop「卸煤機固定」、tanker stop「危險品船出港」、pilot stop「停止進出港」、mooring warn「加派加纜 5/7」、yard warn「貨櫃加固」 |
| cwa3 / cwa6 | 全 ok / 全 ok | crane warn、grain stop、coal warn、tanker warn、其餘 ok ／ 全 ok | mooring+yard warn 其餘 stop ／ 同 cwa3 |
| cwa 窗 | 無4級 / 小雨4級 | 豪雨6級 / 小雨4級 | 大豪雨8級 / 豪雨7級 |
| cards | 2 張（倉儲例行巡檢、引水正常排班） | 4 張（橋式機暫緩 08:05 urgent、穀物停裝 即刻 urgent、油品續作+監控 14:30 前、綁解纜加派 2 員 ok 綠） | 5 張（橋式機錨定 即刻、危險品船出港 6 小時內、卸煤機固定 即刻，皆 urgent；綁解纜加派加纜 ok；櫃場繫固 warn 入夜前） |
| metrics | 皆 { csi: 0.71, pod: 0.83, far: 0.21 } | 同左 | 同左 |

每列 `rules` 2-3 條照基準檔逐字抄（含官方條號：勞動部函釋 0042784、起重升降機具安全規則 §22-6/§22-1、高雄港風災防救要點 §5(2)/§5(3)6/§5(3)9/§5(5)1/§5(9)2/§5(9)3/§5(10)7、碼頭裝卸安全衛生設施標準 §62；慣例：WWD 穀物見雨即停、ISGOTT Ch.16 雷電紅線、裝卸臂 15 m/s、空櫃提前降級、台中港 20 m/s 案例、2025-06 倒灌 SOP、2024 山陀兒案例）。

- [ ] **Step 5: index.ts 降為過渡殼、刪 heat.ts**

`src/screens/dispatch/index.ts` 整檔暫換為（讓 tsc 過、頁面可到達，Task 3 重建完整版）：

```ts
/* Dispatch screen — 2026-07-05 改版過渡殼（Task 2）：舊「熱區網格 + 逐10分鐘序列」
   版面已因資料契約改版而廢棄（heat.ts 已刪），完整新版面於 Task 3 起重建。 */
import type { Screen } from '../types';
import { screenHeader } from '../../ui/components';

const s: Screen = {
  async mount(el, ctx) {
    await ctx.data.dispatch.snapshot(); // 確認 provider 契約可用
    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '港邊人員視角 · MODULE 04',
        color: '#F5A54A',
        title: '短時微氣候 · 即時派工建議',
        badges: ['ConvLSTM 0-90 min'],
        source: 'mock',
      }) +
      '</div>';
  },
};
export default s;
```

刪除 `src/screens/dispatch/heat.ts`（`git rm src/screens/dispatch/heat.ts` 由使用者在 commit 時執行，或先 `rm` 檔案）。`src/screens/dispatch/dispatch.html` 本 task 不動（已無人 import，Task 3 重寫）。

- [ ] **Step 6: 三綠燈**

Run: `npx vitest run`（dispatch-mock 4 PASS + 既有全綠）、`npx tsc --noEmit`（0）、`npm run build`（成功）。
Expected: 全過。瀏覽器抵達 `#/dispatch` 只剩標題列、console 乾淨。

- [ ] **Step 7: 檢查點（使用者 commit）**

---

### Task 3: 版面骨架 + 靜態渲染（hero 三塊 / 矩陣 / 指令卡）+ dispatch.css + tokens.css 清舊

**Files:**
- Modify: `src/screens/dispatch/dispatch.html`（全面重寫）
- Create: `src/screens/dispatch/dispatch.css`
- Modify: `src/screens/dispatch/index.ts`（過渡殼 → 完整靜態渲染）
- Modify: `src/ui/tokens.css`（刪「═══ 派工 ═══」整段：`.heatbox`/`#heat`/`.legend`/`.sugg` 四組——先 `grep -rn "heatbox\|\.legend\|\.sugg" src/` 確認除舊 dispatch 外全站無引用再刪）

**Interfaces:**
- Consumes: `DispatchScenario` 等型別（Task 2）、`parseConclusion`（Task 1）、`screenHeader`（既有）。
- Produces: index.ts 模組層 `cur: ScenarioId`、`renderAll(): void`（Task 4-6 擴充互動時呼叫）；DOM 錨點 id：`#wx #wxwin #wxlvl #wxbf #wxavg #wxgust #wxmet #concl #tl #tlknob #tlbub #hN #h3 #h6 #mxbody #cards #cardn #cnt #ring #cntT #segctl`。

- [ ] **Step 1: 重寫 `dispatch.html`**

骨架照基準檔 body（去掉 mockrail/canvas/header——header 由 `screenHeader` 生成、情境切換器塞 `actionsHtml`）。完整內容：

```html
<div class="hero">
  <div class="wx ok anim" id="wx" style="--d:.08s">
    <div class="win" id="wxwin">未來 90 分鐘 · 港區</div>
    <div class="lvl" id="wxlvl"></div>
    <div class="sub">
      <span><b id="wxbf"></b> 蒲福</span>
      <span><b id="wxavg"></b> m/s 平均</span>
      <span><b id="wxgust"></b> m/s 陣風</span>
    </div>
    <div class="met mono" id="wxmet"></div>
  </div>
  <div class="concl lg anim" data-lg style="--d:.14s">
    <div class="line" id="concl"></div>
    <div class="tlwrap">
      <div class="tl" id="tl" role="slider" tabindex="0" aria-label="預測時間軸"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow="20">
        <div class="track"><div class="segN"></div><div class="segC"></div></div>
        <div class="divider"></div>
        <div class="bubble" id="tlbub"></div>
        <div class="knob" id="tlknob"></div>
      </div>
      <div class="ticks">
        <span style="left:0">NOW</span>
        <span class="srcm" style="left:20%">ConvLSTM</span>
        <span style="left:53%">+90m</span>
        <span class="srcm" style="left:60%">CWA</span>
        <span style="left:75%">+3h</span>
        <span style="right:0">+6h</span>
      </div>
    </div>
  </div>
  <div class="cnt lg anim" data-lg id="cnt" style="--d:.2s">
    <div class="ring" id="ring">
      <div class="in">
        <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6"/></svg>
        <span class="t" id="cntT">10:00</span>
      </div>
    </div>
    <span class="lb">模型更新</span>
  </div>
</div>
<div class="dcols">
  <div class="mx lg anim" data-lg style="--d:.26s">
    <div class="mhead">
      <span class="c0"></span>
      <span class="cn" id="hN">CONVLSTM 0-90 MIN</span>
      <span class="cc" id="h3">+3H</span>
      <span class="cc" id="h6">+6H</span>
    </div>
    <div id="mxbody"></div>
    <div class="mlegend">
      <span><i class="st-ok"></i>可作業</span>
      <span><i class="st-warn"></i>戒備</span>
      <span><i class="st-stop"></i>停工</span>
    </div>
  </div>
  <div class="rc anim" style="--d:.34s">
    <div class="rch"><span>派工指令</span><span class="mono" id="cardn"></span></div>
    <div id="cards"></div>
  </div>
</div>
```

（注意：兩欄容器類名用 `.dcols`、圖例用 `.mlegend`，避開 tokens.css 既有的 `.cols`/`.legend` 語意衝突。）

- [ ] **Step 2: 新建 `dispatch.css`**

內容 = 基準檔第二個 `<style>` 區塊（「Dispatch 頁改版 mockup 專用樣式」）逐條搬入並改造：
1. 每條選擇器加 `#s-dispatch ` 前綴（如 `#s-dispatch .wx.ok{...}`）。
2. 刪除 mockup 專屬：`:root` 變數區（tokens.css 已有同名變數）、`html,body`、`#harbor`、`.glowfx`、`.anim`/`@keyframes rise`（tokens.css 已有）、`.mockrail`、`main/.pscreen/.swrap`、`.eyebrow/.trow/.lg-chip/.src`（screenHeader 走 tokens.css 既有樣式）、`#toast/.tst`（shell 有全域 toast）。
3. `.cols` 重命名 `.dcols`、`.legend` 重命名 `.mlegend`（對應 Step 1 markup）。
4. 保留並搬入：`.segctl/.scbtn`、`.hero/.wx（含 ok/warn/stop 三態）`、`.concl`、`.tlwrap/.tl/.track/.segN/.segC/.divider/.knob/.bubble/.ticks`、`.cnt/.ring`、`.mx/.mhead/.mrow/.chev/.mseg/.st-ok/.st-warn/.st-stop/.mexp/.tag`、`.mlegend`、`.rc/.rch/.dcard/.dbadge`，及各自的 reduced-motion 覆寫。

- [ ] **Step 3: 重寫 `index.ts` 靜態渲染**

```ts
/* Dispatch screen — 短時微氣候 · 即時派工建議（2026-07-05 spec 改版）。
   互動基準：docs/preview/preview-dispatch-redesign.html。
   本檔為膠合層：一切內容從當前情境（cur）重渲染；結論標記解析走 ./conclusion。 */
import type { Screen, ScreenCtx } from '../types';
import type { DispatchScenario, DispatchCard, OpRow, OpStatus, RainLevel } from '../../data/types';
import { screenHeader } from '../../ui/components';
import { parseConclusion } from './conclusion';
import template from './dispatch.html?raw';
import './dispatch.css';

type ScenarioId = DispatchScenario['id'];

let scenarios: DispatchScenario[] = [];
let cur: ScenarioId = 'stable';
let sectionEl: HTMLElement;
let sCtx: ScreenCtx;

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
  sectionEl.querySelector(sel) as T;
const scn = (): DispatchScenario => scenarios.find((s) => s.id === cur)!;

/* 六級雨量分級 → hero 風險色三態（spec §3：大字塊底色 = 當前風險色） */
const WXCLS: Record<RainLevel, 'ok' | 'warn' | 'stop'> =
  { 無: 'ok', 小雨: 'ok', 大雨: 'warn', 豪雨: 'stop', 大豪雨: 'stop', 超大豪雨: 'stop' };
const SYM: Record<OpStatus, string> = { stop: '✕ ', warn: '! ', ok: '' };

function renderHero(sc: DispatchScenario): void {
  const n = sc.nowcast;
  const wx = $('#wx');
  wx.classList.remove('ok', 'warn', 'stop');
  wx.classList.add(WXCLS[n.rainLevel]);
  $('#wxlvl').textContent = n.rainLevel === '無' ? '無降雨' : n.rainLevel;
  $('#wxbf').textContent = `${n.beaufort} 級`;
  $('#wxavg').textContent = n.windAvg.toFixed(1);
  $('#wxgust').textContent = n.windGust.toFixed(1);
  $('#wxmet').textContent =
    `CSI ${sc.metrics.csi.toFixed(2)} · POD ${sc.metrics.pod.toFixed(2)} · FAR ${sc.metrics.far.toFixed(2)}`;
  $('#concl').innerHTML = parseConclusion(sc.conclusion);
}

function rowHtml(op: OpRow): string {
  return (
    `<div class="mrow" data-op="${op.id}" tabindex="0" role="button" aria-expanded="false">` +
    `<span class="chev">▶</span><span class="nm">${op.name}</span>` +
    `<span class="mseg now st-${op.now.status}">${SYM[op.now.status]}${op.now.action}</span>` +
    `<span class="mseg cwa st-${op.cwa3}"></span>` +
    `<span class="mseg cwa st-${op.cwa6}"></span></div>`
  );
}

function renderMatrix(sc: DispatchScenario): void {
  $('#mxbody').innerHTML = sc.ops.map(rowHtml).join('');
}

function cardHtml(c: DispatchCard, i: number): string {
  const b = c.badge
    ? `<span class="dbadge ${c.badge.urgent ? 'u' : 'n'}">${c.badge.text}</span>` : '';
  return (
    `<div class="dcard lg lg-static ${c.level} anim" style="--d:${(0.05 * i).toFixed(2)}s">` +
    `<b>${c.title}${b}</b><p>${c.body}</p></div>`
  );
}

function renderCards(sc: DispatchScenario): void {
  $('#cardn').textContent = String(sc.cards.length);
  $('#cards').innerHTML = sc.cards.map(cardHtml).join('');
}

function renderAll(): void {
  const sc = scn();
  renderHero(sc);
  renderMatrix(sc);
  renderCards(sc);
}

function segctlHtml(): string {
  return (
    '<div class="segctl lg" data-lg id="segctl"><span class="cap">模擬情境</span>' +
    scenarios.map((s) =>
      `<button class="scbtn${s.id === cur ? ' on' : ''}" data-scn="${s.id}">${s.label}</button>`,
    ).join('') +
    '</div>'
  );
}

const s: Screen = {
  async mount(el, ctx) {
    sectionEl = el;
    sCtx = ctx;
    scenarios = (await ctx.data.dispatch.snapshot()).scenarios;
    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '港邊人員視角 · MODULE 04',
        color: '#F5A54A',
        title: '短時微氣候 · 即時派工建議',
        badges: ['ConvLSTM 0-90 min'],
        source: 'mock',
        actionsHtml: segctlHtml(),
      }) +
      template +
      '</div>';
    renderAll();
  },
};
export default s;
```

（`sCtx` 本 task 只賦值未讀取——Task 4 的 toast 需要它，先建立掛點。已查證 `tsconfig.json` 僅 `strict`、無 `noUnusedLocals`，不會報錯。）

- [ ] **Step 4: tokens.css 刪「═══ 派工 ═══」段**

先確認無其他引用：`grep -rn "heatbox\|class=\"legend\|\.sugg" src/ | grep -v dispatch`（應無結果），然後刪除 tokens.css 中 `/* ═══ 派工 ═══ */` 至 `/* ═══ 政策 ═══ */` 之間的 `.heatbox`/`#heat`/`.legend`/`.legend i`/`.sugg` 系列規則。

- [ ] **Step 5: 三綠燈 + 瀏覽器驗證**

Run: `npx tsc --noEmit`、`npx vitest run`、`npm run build`。
瀏覽器（headless Chrome + CDP，比照前例）驗證 `#/dispatch`：hero 綠色大字塊「無降雨」、蒲福 4 級數字、結論句、時間軸（knob/泡泡靜置）、進度環 10:00、矩陣 7 列全綠、卡片 2 張、圖例；情境切換器三顆按鈕渲染（尚不可互動）；console 乾淨；切到其他頁再切回不重複掛載。

- [ ] **Step 6: 檢查點（使用者 commit）**

---

### Task 4: 情境切換 + 規則展開

**Files:**
- Modify: `src/screens/dispatch/index.ts`

**Interfaces:**
- Consumes: Task 3 的 `renderAll()`/`cur`/DOM 錨點；`ctx.ui.toast({ title, message? })`（既有 ToastOpts）。
- Produces: `cancelTimers(): void`、`stopInference(): void` 掛點（Task 6 實作 stopInference 本體，本 task 先建空函式）、`openOp: string | null`；`updateBubble()` 由 Task 5 提供——本 task 於情境切換尾端以 `bubbleRefresh?.()` 可選呼叫（模組層 `let bubbleRefresh: (() => void) | null = null`）。

- [ ] **Step 1: 模組層狀態與工具**

```ts
let openOp: string | null = null;              // 展開中的作業列
let timers: ReturnType<typeof setTimeout>[] = []; // 進行中的動畫（切情境取消）
let bubbleRefresh: (() => void) | null = null; // Task 5 指定
function later(fn: () => void, ms: number): void { timers.push(setTimeout(fn, ms)); }
function cancelTimers(): void { timers.forEach(clearTimeout); timers = []; }
let stopInference: () => void = () => {};      // Task 6 覆寫
```

- [ ] **Step 2: 規則展開（事件委派，mount 內綁一次）**

```ts
function tagHtml(tag: 'official' | 'industry'): string {
  return `<span class="tag ${tag === 'official' ? 'o' : 'i'}">${tag === 'official' ? '官方' : '慣例'}</span>`;
}
function toggleRow(row: HTMLElement): void {
  const id = row.getAttribute('data-op')!;
  sectionEl.querySelector('#mxbody .mexp')?.remove();
  const prev = sectionEl.querySelector('#mxbody .mrow.open');
  if (prev) { prev.classList.remove('open'); prev.setAttribute('aria-expanded', 'false'); }
  if (openOp === id) { openOp = null; return; }   // 再點同列 = 收合
  openOp = id;
  row.classList.add('open');
  row.setAttribute('aria-expanded', 'true');
  const op = scn().ops.find((o) => o.id === id)!;
  const exp = document.createElement('div');
  exp.className = 'mexp';
  exp.innerHTML = op.rules.map((r, i) =>
    i === 0
      ? `<div>${r.text}</div><div class="r">${tagHtml(r.tag)}${r.basis}</div>`
      : `<div class="r">${tagHtml(r.tag)}${r.text} — ${r.basis}</div>`,
  ).join('');
  row.after(exp);
}
// mount() 內：
$('#mxbody').addEventListener('click', (e) => {
  const row = (e.target as HTMLElement).closest<HTMLElement>('.mrow');
  if (row) toggleRow(row);
});
$('#mxbody').addEventListener('keydown', (e) => {
  const row = (e.target as HTMLElement).closest<HTMLElement>('.mrow');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleRow(row); }
});
```

`renderMatrix()` 尾端補 `openOp = null;`（重渲染即重置展開態）。

- [ ] **Step 3: 情境切換（mount 內綁一次）**

```ts
const TOAST: Record<ScenarioId, string> = {
  stable: '全作業線正常',
  rain: '3 項作業停工、1 項加派',
  typhoon: '全港停止作業預備',
};
$('#segctl').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.scbtn');
  if (!btn || btn.classList.contains('on')) return;
  cancelTimers();          // 取消進行中的推論動畫（Task 6），不洩漏舊情境內容
  stopInference();
  cur = btn.getAttribute('data-scn') as ScenarioId;
  sectionEl.querySelectorAll('.scbtn').forEach((b) => b.classList.toggle('on', b === btn));
  renderAll();
  bubbleRefresh?.();       // Task 5：泡泡文字跟上新情境
  sCtx.ui.toast({ title: `已切換情境：${scn().label}`, message: TOAST[cur] });
});
```

- [ ] **Step 4: 三綠燈 + 瀏覽器驗證**

驗證項（headless CDP）：三情境往返切換 hero 變色（ok/warn/stop class）+ 結論強調 span + 矩陣翻轉 + 卡片張數 2/4/5 + toast 內容正確；rain 情境點 crane 展開（官方+慣例徽章、「目前未達」行）、點 grain 互斥、再點收合；切情境後無殘留 `.mexp`；console 乾淨。

- [ ] **Step 5: 檢查點（使用者 commit）**

---

### Task 5: 時間軸游標（拖曳 / 點擊 / 鍵盤 + 泡泡 + 欄標頭連動）

**Files:**
- Modify: `src/screens/dispatch/index.ts`

**Interfaces:**
- Consumes: Task 3 DOM 錨點（`#tl #tlknob #tlbub #hN #h3 #h6`）、`scn()`。
- Produces: `updateBubble(): void`（並在 mount 內指定 `bubbleRefresh = updateBubble`，供 Task 4 情境切換時刷新）。

- [ ] **Step 1: 實作（mount 內，靜態渲染之後）**

分段常數與基準檔一致：0-55% = ConvLSTM 0-90 min、55-77.5% = +3h、77.5-100% = +6h。

```ts
const N_END = 55, C3_END = 77.5;
let pct = 20;
function updateBubble(): void {
  const sc = scn();
  const tl = $('#tl'), knob = $('#tlknob'), bub = $('#tlbub');
  let txt: string, zone: 'N' | '3' | '6';
  if (pct <= N_END) {
    const min = Math.round((pct / N_END) * 90 / 5) * 5;
    txt = `${min === 0 ? 'NOW' : `+${min} min`} · ConvLSTM · ${sc.nowcast.rainLevel}`;
    zone = 'N';
  } else if (pct <= C3_END) {
    txt = `+3h · CWA · ${sc.cwa[0].rainLevel}`; zone = '3';
  } else {
    txt = `+6h · CWA · ${sc.cwa[1].rainLevel}`; zone = '6';
  }
  knob.style.left = `${pct}%`;
  bub.style.left = `${Math.min(Math.max(pct, 12), 88)}%`;   // 泡泡不出界
  bub.textContent = txt;
  tl.setAttribute('aria-valuenow', String(Math.round(pct)));
  $('#hN').classList.toggle('hl', zone === 'N');
  $('#h3').classList.toggle('hl', zone === '3');
  $('#h6').classList.toggle('hl', zone === '6');
}
bubbleRefresh = updateBubble;
const tlEl = $('#tl');
function setPct(e: PointerEvent): void {
  const r = tlEl.getBoundingClientRect();
  pct = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
  updateBubble();
}
let dragging = false;
tlEl.addEventListener('pointerdown', (e) => {
  dragging = true;
  try { tlEl.setPointerCapture(e.pointerId); } catch { /* 合成事件/邊界情況無 active pointer */ }
  setPct(e);
});
tlEl.addEventListener('pointermove', (e) => { if (dragging) setPct(e); });
tlEl.addEventListener('pointerup', () => { dragging = false; });
tlEl.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { pct = Math.max(0, pct - 2.5); updateBubble(); e.preventDefault(); }
  if (e.key === 'ArrowRight') { pct = Math.min(100, pct + 2.5); updateBubble(); e.preventDefault(); }
  /* #tl 是 div[role=slider]，不在 main.ts 全域導覽鍵的 INPUT/TEXTAREA/SELECT bail-out 內：
     focus 在時間軸上按數字/Enter 會誤觸全站導覽，必須在此隔離（確定性 bug，非猜測）。 */
  if (/^[0-9]$/.test(e.key) || e.key === 'Enter') e.stopPropagation();
});
updateBubble();   // 首繪
```

（`setPointerCapture` 必包 try/catch——preview 驗收時實測合成 pointer 事件會拋 NotFoundError。）

- [ ] **Step 2: 三綠燈 + 瀏覽器驗證**

驗證項：初始泡泡「+20% 位置 · ConvLSTM」；點軌道 30%/65%/90% 三段泡泡資料源與雨級正確（rain 情境：大雨/豪雨/小雨）、欄標頭 `hl` 互斥連動；拖曳連續更新；`ArrowLeft/Right` 可移動；`#tl` focus 時按 `1`-`6`/`Enter` 不觸發全站導覽（Step 1 已內建 stopPropagation 隔離，此處實測確認）、blur 後按 `2` 仍正常導覽 policy；console 乾淨。

- [ ] **Step 3: 檢查點（使用者 commit）**

---

### Task 6: 模型更新倒數（10:00 自動 → 推論動畫 → 微調 + toast）+ show/hide 生命週期 + reduced-motion

**Files:**
- Modify: `src/screens/dispatch/index.ts`

**Interfaces:**
- Consumes: Task 4 的 `later()`/`cancelTimers()`/`stopInference` 掛點、`sCtx.ui.toast`。
- Produces: `Screen.show()`/`Screen.hide()`（router 既有呼叫約定）；`stopInference` 本體覆寫。

- [ ] **Step 1: 實作**

```ts
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOTAL = 600;                 // 10:00（spec 定案：真實系統節奏）
let remain = TOTAL;
let inferring = false;
let tick: ReturnType<typeof setInterval> | null = null;

function fmt(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function paintRing(): void {
  $('#ring').style.setProperty('--pp', `${(remain / TOTAL) * 100}%`);
  $('#cntT').textContent = inferring ? '推論中' : fmt(remain);
}
stopInference = () => {            // 覆寫 Task 4 掛點：情境切換時中止推論動畫
  inferring = false;
  $('#cnt').classList.remove('running');
  paintRing();
};
function runInference(): void {
  if (inferring) return;           // 不可重入
  inferring = true;
  $('#cnt').classList.add('running');
  remain = TOTAL;
  paintRing();
  later(() => {
    inferring = false;
    $('#cnt').classList.remove('running');
    /* 微調：windAvg/windGust ±0.2-0.4 視覺抖動（不改燈號、不進資料，spec §7-4） */
    const n = scn().nowcast;
    const dir = Math.random() > 0.5 ? 1 : -1;
    const j = (v: number) => Math.max(0, v + (Math.random() * 0.2 + 0.2) * dir);
    $('#wxavg').textContent = j(n.windAvg).toFixed(1);
    $('#wxgust').textContent = j(n.windGust).toFixed(1);
    const now = new Date();
    sCtx.ui.toast({
      title: 'ConvLSTM 已更新',
      message: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} 推論完成`,
    });
    paintRing();
  }, RM ? 0 : 2000);
}
/* DEV-only 測試鉤：倒數 10 分鐘，驗收腳本等不到自然歸零，需一個觸發入口
   （比照 preview 基準檔的 __forceUpdate；import.meta.env.DEV 保證不進 production build）。 */
if (import.meta.env.DEV) {
  (window as unknown as { __dispatchForceUpdate?: () => void }).__dispatchForceUpdate = runInference;
}
```

`Screen` 物件補：

```ts
show() {
  paintRing();
  if (!tick) tick = setInterval(() => {
    if (inferring) return;
    remain -= 1;
    if (remain <= 0) { runInference(); return; }
    paintRing();
  }, 1000);
},
hide() {
  if (tick) { clearInterval(tick); tick = null; }   // 切走不背景倒數（spec §7-4）
  cancelTimers();                                   // 進行中的推論動畫一併取消
  stopInference();
},
```

（`mount()` 尾端不啟動計時——router 首掛後必呼叫 `show()`，由它一手包辦，對齊 heat 時代的 show() 慣例。）

- [ ] **Step 2: 三綠燈 + 瀏覽器驗證**

驗證項（headless CDP，`npm run dev` 下用 Step 1 的 `window.__dispatchForceUpdate()` 觸發推論，不必等 10 分鐘）：
1. `#cntT` 每秒遞減、環形 `--pp` 同步縮小（觀察 3 秒即可）。
2. `__dispatchForceUpdate()` → `running` class + 「推論中」→ 約 2s 後 `#wxavg`/`#wxgust` 數值改變（±0.2-0.4 範圍）+ toast「ConvLSTM 已更新」+ 倒數重置 10:00。
3. 推論中再呼叫一次無效（不可重入）；推論中切情境 → `running` 被移除、無延遲洩漏 toast。
4. 切到別頁（hash 導覽）再回來：倒數暫停/續跑（hide 清 interval、show 重啟），背景頁不計時。
5. `prefers-reduced-motion: reduce`（CDP `Emulation.setEmulatedMedia`）下推論完成不經 2s 轉圈。
6. `npm run build` 後 `grep -c "__dispatchForceUpdate" dist/assets/*.js` 應為 0（DEV 鉤未進 production）。
7. console 乾淨。

- [ ] **Step 3: 檢查點（使用者 commit）**

---

### Task 7: 全站驗收（spec §10 逐項）+ HANDOFF 收尾

**Files:**
- Modify: `HANDOFF.md`（進度、驗收證據、殘留事項）
- 不改任何程式碼（發現缺陷則回報、修正後重驗）

**Interfaces:**
- Consumes: Task 1-6 全部產出。
- Produces: 驗收報告（`.superpowers/sdd/` scratch）。

- [ ] **Step 1: 三綠燈**

`npx tsc --noEmit` 0、`npx vitest run` 全綠（新增 dispatch-conclusion 3 + dispatch-mock 4）、`npm run build` 成功。
（注意既知 flaky：`tests/twin-provider.test.ts` 高負載下逾時屬 pre-existing，非本分支問題，重跑閒置機器確認即可。）

- [ ] **Step 2: spec §10 逐項（headless Chrome + CDP，比照 policy Task 8 手法）**

1. 三情境切換全連動（hero 變色/結論/矩陣/卡片/toast；切換中止進行中動畫）。
2. 規則展開單列互斥、chevron 態、官方/慣例徽章、未命中門檻行。
3. 時間軸把手拖曳、三段泡泡資料源切換、欄標頭 hl 連動。
4. 更新倒數只在本頁 active 計時；歸零 → 推論 → 抖動 + toast → 重置；抖動不改燈號。
5. `prefers-reduced-motion` 降級完整。
6. 鍵盤導覽迴歸：`#tl` focus 按 `1`-`6` 不跳頁（Task 5 若加 stopPropagation 要重驗）、非輸入元素導覽正常。
7. 全站七頁導覽迴歸、console 全程零錯誤。
8. `heat.ts` 無殘留引用（`grep -rn "heat" src/` 僅剩無關命中）；tokens.css 無 dispatch 舊樣式外漏（`.heatbox`/`.legend`/`.sugg` 已刪且全站無引用）。

- [ ] **Step 3: HANDOFF 更新（進度 + 誠實驗收分野 + 殘留）**

- [ ] **Step 4: 檢查點（使用者 commit）**

---

## Self-Review 紀錄

- spec 覆蓋：§4 契約=Task 2；§5 規則庫=Task 2 JSON；§6 劇本=Task 2 JSON；§3 版面=Task 3；§7-1/7-3=Task 4；§7-2=Task 5；§7-4/7-5=Task 6；§8 檔案=Task 2/3；§10 驗收=Task 7 全項。
- 型別一致：`ScenarioId`/`renderAll`/`cancelTimers`/`stopInference`/`bubbleRefresh`/`updateBubble` 跨 task 名稱已核對。
- 已知風險先寫進實作碼（非驗證時再看）：`setPointerCapture` try/catch（Task 5）、`#tl` div 非 INPUT 的數字/Enter stopPropagation 隔離（Task 5 Step 1，確定性 bug）、計時器生命週期 hide 清理（Task 6）、DEV-only `__dispatchForceUpdate` 測試鉤（Task 6，否則 10 分鐘倒數不可驗證；build 後需確認未進 production）。
- 二輪 review 修正（2026-07-05）：spec §4/§8「cards 3-5 張」與 §6.1 stable 2 張矛盾 → 契約與測試統一為 2-5 張；已查證 `tsconfig.json` 無 `noUnusedLocals`（Task 3 sCtx 掛點合法）、`mock.ts` 既有 `dispatch as DispatchSnapshot` 斷言手法可吃 JSON 寬化型別（policy 判別聯集前例已證）、section id 慣例 `s-dispatch`（router.ts:48）與 CSS 前綴一致。

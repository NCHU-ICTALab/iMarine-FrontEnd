/* Hero 畫面（PPT 開場）— 兩段式：電影感封面 COVER ⇄ 戰情總覽 OVERVIEW。
   markup 搬自基準檔 docs/preview/preview-src-v3.html 的 <!-- ══════════ HERO ══════════ -->：
   封面（kicker/大標/副標/六入口卡/CTA/署名行）與總覽（header/四張 KPI/迷你地圖/六模組卡/近 7 日 chart）。
   六入口卡與六模組卡由 SCREENS.slice(1)（六個功能頁，hero 自己除外）動態生成，不手刻六份重複 markup；
   icon/color 對齊各卡 --mc 與 svg stroke，short 作卡片標題（沿用 registry 既有欄位，非本檔另建資料源）。
   COVER 為靜態文案；OVERVIEW 的 KPI／模組摘要值／近 7 日 chart 皆綁 ctx.data.overview.snapshot()。 */

import type { Screen, ScreenCtx } from '../types';
import template from './hero.html?raw';
import { SCREENS, type ScreenDef } from '../../shell/registry';
import { statRow, type StatItem } from '../../ui/components';
import type { OverviewSnapshot } from '../../data/types';
import { initOvMap } from './ovmap';

type HeroState = 'cover' | 'ov';

// 入口卡的英文技術次標——registry 只定義 icon/short/color（見 task-6-brief 步驟 1），
// 這行英文標籤是 hero 封面獨有的裝飾細節，非其餘 screen 共用契約，故就地建六筆對照、不擴充 registry。
const TECH_TAG: Record<string, string> = {
  carbon: 'SU TOKEN',
  policy: 'LLM + RAG',
  twin: 'DIGITAL TWIN',
  dispatch: 'ConvLSTM',
  epidemic: 'AIS × IHR',
  alert: 'CELL BROADCAST',
};

function entryCard(def: ScreenDef): string {
  return (
    `<button class="entry lg" data-lg data-go="${def.id}" style="--mc:${def.color}">` +
    `<svg viewBox="0 0 24 24">${def.icon}</svg>` +
    `<b>${def.short}</b><span>${TECH_TAG[def.id] ?? ''}</span></button>`
  );
}

function moduleCard(def: ScreenDef, value: string): string {
  return (
    `<button class="modcard lg lg-static" data-go="${def.id}" style="--mc:${def.color}">` +
    `<span class="t"><i></i>${def.short}</span><span class="v">${value}</span></button>`
  );
}

// OverviewSnapshot → 四張 statRow 卡（欄位對應見 task-6-brief 步驟 1：kpi.vessels→今日進出港船舶 …）。
// delta 文字原樣寫死符號／用詞以對齊基準檔字面（"6.2%"／"−12% 改善"，"−" 為 U+2212 MINUS SIGN）。
function kpiItems(snap: OverviewSnapshot): StatItem[] {
  const { kpi, sparks } = snap;
  return [
    { label: '今日進出港船舶', value: kpi.vessels, delta: `${kpi.vesselsDelta}%`, spark: sparks.vessels },
    { label: '在泊船席', value: kpi.berthsUsed, suffix: ` / ${kpi.berthsTotal}`, spark: sparks.berths },
    {
      label: '平均等候時間',
      value: kpi.waitHr,
      decimals: 1,
      suffix: ' hr',
      delta: `−${Math.abs(kpi.waitDelta)}% 改善`,
      spark: sparks.wait,
    },
    { label: '今日預估碳排', value: kpi.co2T, suffix: ' t', spark: sparks.co2 },
  ];
}

// mount() 只呼叫一次，以下模組層狀態供 show()/hide()（每次切入/切出呼叫）與 setHeroState 共用。
// 本 app 僅有單一 hero screen 實例，用模組層變數而非 class 沒有多實例風險。
let heroState: HeroState = 'cover';
let ovMap: { start(): void; stop(): void } | null = null;
let ctxRef: ScreenCtx | null = null;

function setHeroState(next: HeroState): void {
  heroState = next;
  document.body.setAttribute('data-hero', next);
  ctxRef?.setMode(next === 'ov' ? 'ov' : 'cover');
  if (next === 'ov') ovMap?.start();
  else ovMap?.stop();
}

const s: Screen = {
  async mount(el, ctx) {
    ctxRef = ctx;
    const snap = await ctx.data.overview.snapshot();
    const modules = SCREENS.slice(1); // 六個功能頁，hero 自己排除

    const entriesHtml = modules.map(entryCard).join('');
    const modulesHtml = modules
      .map((def) => moduleCard(def, snap.modules.find((m) => m.id === def.id)?.value ?? ''))
      .join('');

    el.innerHTML = template
      .replace('<!--ENTRIES-->', entriesHtml)
      .replace('<!--STATS-->', statRow(kpiItems(snap)))
      .replace('<!--MODULES-->', modulesHtml)
      .replace('__POINTS__', snap.weekly.points.join(','))
      .replace('__LABELS__', snap.weekly.labels.join(','));

    ovMap = initOvMap(el.querySelector('#ovMap') as HTMLCanvasElement);

    el.querySelector('#toOverview')?.addEventListener('click', () => setHeroState('ov'));
    // main.ts 只在 router.current()==='hero' 時才 dispatch 'hero:toggle'，故這裡綁一次即可、毋須解綁。
    window.addEventListener('hero:toggle', () => setHeroState(heroState === 'ov' ? 'cover' : 'ov'));
    // 入口卡與模組卡共用同一組 [data-go] 委派點擊，跳頁交給 hashchange（router 已監聽）處理。
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-go]');
      if (btn) location.hash = '#/' + (btn.getAttribute('data-go') as string);
    });

    document.body.setAttribute('data-hero', 'cover'); // 預設封面態（對齊基準檔開場 setHero('cover')）
  },

  show() {
    // router.go() 對任何 screen（含 hero）都固定「先呼叫 show()，再呼叫 applyMode(def.mode)」；
    // registry 給 hero 的 mode 固定是 'cover'（見 registry.ts），若這裡同步呼叫 ctx.setMode 會被
    // 那行立刻蓋掉。改用 queueMicrotask 延到 router.go() 那輪同步流程跑完後（仍在下一次瀏覽器繪製
    // 之前，不會有畫面閃爍）才寫入，讓「總覽 → 點模組卡切到別的功能頁 → 按 0／點 rail 圖示切回
    // hero」這條路徑能正確回到總覽，而非每次都被重置成封面。
    const state = heroState;
    queueMicrotask(() => ctxRef?.setMode(state === 'ov' ? 'ov' : 'cover'));
    if (state === 'ov') ovMap?.start();
  },

  hide() {
    ovMap?.stop();
  },
};

export default s;

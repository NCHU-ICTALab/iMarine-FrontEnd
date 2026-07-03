/* Epidemic screen 外殼膠合 — Task 10。
   markup 搬自基準檔 docs/preview/preview-src-v3.html 的 <!-- ══════════ 疫情 ══════════ -->：
   標頭改用 screenHeader；航跡圖 canvas 邏輯搬進 route.ts（見 drawRoute，含各港陸地點群）；
   停靠序列卡（.tseq）、三因子 meter（.factor）、防護建議、參考案例全部由 snapshot 動態產生——
   epidemic.html 只留 <!--PORTS--> / <!--FACTORS--> / <!--ADVICE--> 三個清單佔位與 __CAP__ /
   __RISK__ / __LEVEL__ / __FACTORLBL__ / __REFERENCE__ 五個單值佔位（對齊 hero.html 的
   <!--ENTRIES--> 與 dispatch.html 的 __WINDS__ 兩種手法），不手刻固定筆數/固定數值的卡片。
   epidemic 是標準 'ov' 頁（見 registry.ts 的 mode:'ov'），用 .swrap 版心，不是滿版（同 dispatch）。 */

import type { Screen } from '../types';
import { screenHeader } from '../../ui/components';
import type { EpidemicSnapshot } from '../../data/types';
import template from './epidemic.html?raw';
import { drawRoute } from './route';

type Port = EpidemicSnapshot['ports'][number];
type Factor = EpidemicSnapshot['factors'][number];

// mark → outline/文字色，對齊基準檔 .tnode 的 inline outline 與 <b> 色彩 class
// （dim 無 outline、無色彩 class；rose/amber 各自套對應色）。
const MARK_OUTLINE: Record<Port['mark'], string> = {
  dim: '',
  rose: ' style="outline:1px solid var(--rose)"',
  amber: ' style="outline:1px solid var(--amber)"',
};
const MARK_TEXT: Record<Port['mark'], string> = {
  dim: '',
  rose: ' class="rosec"',
  amber: ' class="amberc"',
};

function portCard(p: Port): string {
  const sub = p.note ? `${p.date} · ${p.note}` : p.date; // 基隆無 note，僅顯示日期（對齊基準檔）
  return `<div class="tnode lg lg-static"${MARK_OUTLINE[p.mark]}><b${MARK_TEXT[p.mark]}>${p.name}</b><span>${sub}</span></div>`;
}

// 卡片間以 .tsep 分隔線相接，最後一張後面不留分隔線（join 天然涵蓋）。
function tseq(ports: EpidemicSnapshot['ports']): string {
  return ports.map(portCard).join('<span class="tsep"></span>');
}

function factorRow(f: Factor): string {
  return `<div class="frow"><span class="fk">${f.name}</span><div class="lg-meter" data-lg-value="${f.value}"></div><span class="fv">${f.value}</span></div>`;
}

// 供 show() 呼叫的重繪入口，於 mount() 內指定並捕捉當次 snapshot 的 ports + canvas 參照——
// ports 本頁掛載後不再變動（無互動可改動它，不同於 dispatch 的 currentT 滑桿值），故不需另立
// 模組層 ports 變數，直接讓這個 closure 捕捉 mount() 的區域變數即可（對齊 dispatch/index.ts
// 的 redraw 手法，僅省去它獨有的 currentT 那層）。
let redraw: (() => void) | null = null;

const s: Screen = {
  async mount(el, ctx) {
    const snap = await ctx.data.epidemic.snapshot();

    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '港邊人員視角 · MODULE 05',
        color: '#F0648C',
        title: '疫情自動追溯',
        badges: ['AIS × WHO IHR · 規則式評分'],
        source: 'mock',
      }) +
      template
        .replace('__CAP__', `${snap.ship} · 過去 14 天停靠序列`)
        .replace('<!--PORTS-->', tseq(snap.ports))
        .replace('__RISK__', String(snap.risk))
        .replace('__LEVEL__', snap.level)
        .replace('__FACTORLBL__', snap.factors.map((f) => f.name).join(' × '))
        .replace('<!--FACTORS-->', snap.factors.map(factorRow).join(''))
        .replace('<!--ADVICE-->', snap.advice.map((a) => `<span>${a}</span>`).join(''))
        .replace('__REFERENCE__', snap.reference) +
      '</div>';

    const canvas = el.querySelector('#routeCv') as HTMLCanvasElement;

    // router 掛載 screen 時本 section 尚未加上 .active（router.go 先 await mount() 才補 class，
    // 見 router.ts），此時 .route 的祖先鏈仍是 .screen{display:none}，量到的 getBoundingClientRect
    // 是 0×0——故首繪不能放在這裡，要交給 show()（見下方）。這裡只指定 redraw 這支入口。
    redraw = () => drawRoute(canvas, snap.ports);

    // 使用者正在本頁時調整視窗大小才需即時重排；切到別頁後的 resize 由回頁時的 show() 補繪即可，
    // 故加一道 .active 守門避免對背景頁做多餘運算（同 dispatch/index.ts）。
    addEventListener('resize', () => {
      if (el.classList.contains('active')) redraw?.();
    });
  },

  // router 每次切入本頁（含首次，於 mount() 之後）都會在補上 .active 後呼叫 show()，此時 section
  // 已可見、航跡 canvas 量得到正確尺寸；drawRoute() 每次呼叫都重新量測容器並整幅重繪，一併涵蓋
  // 「首次進入」與「切走時 resize 過、再切回」兩種情境（同 dispatch/index.ts 的 redraw 手法）。
  show() {
    redraw?.();
  },
};

export default s;

/* Dispatch screen 外殼膠合 — Task 9。
   markup 搬自基準檔 docs/preview/preview-src-v3.html 的 <!-- ══════════ 派工 ══════════ -->：
   標頭改用 screenHeader（CSI/POD/FAR 三個 pill 塞進 actionsHtml，值來自 snapshot.metrics）；
   熱區 canvas 邏輯搬進 heat.ts（見 initHeat，含 hcoast 海岸線與僅海面繪格）；四張建議卡與風速
   折線圖改由 snapshot 動態產生——dispatch.html 只留 <!--SUGGESTIONS--> 與 __WINDS__ 兩個佔位
   標記（對齊 hero.html 的 <!--ENTRIES--> 手法），不手刻固定筆數的卡片。
   dispatch 是標準 'ov' 頁（見 registry.ts 的 mode:'ov'），用 .swrap 版心，不是滿版（不同於 twin）。 */

import type { Screen } from '../types';
import { screenHeader } from '../../ui/components';
import type { DispatchSnapshot } from '../../data/types';
import template from './dispatch.html?raw';
import { initHeat } from './heat';

type Suggestion = DispatchSnapshot['suggestions'][number];

function metricPills(m: DispatchSnapshot['metrics']): string {
  return (
    `<span class="pill" data-lg-tip="臨界成功指數">CSI ${m.csi.toFixed(2)}</span>` +
    `<span class="pill" data-lg-tip="偵測率">POD ${m.pod.toFixed(2)}</span>` +
    `<span class="pill" data-lg-tip="誤報率">FAR ${m.far.toFixed(2)}</span>`
  );
}

// 嚴重度 → 色彩，對齊基準檔 .sugg .sev 的 inline background（rose/amber/lg-accent 三色）。
const SEV_COLOR: Record<Suggestion['level'], string> = {
  rose: 'var(--rose)',
  amber: 'var(--amber)',
  ok: 'var(--lg-accent)',
};

// stagger 進場延遲比照基準檔四張建議卡的 --d:.2s/.25s/.3s/.35s（風速圖固定 --d:.4s，見 dispatch.html）。
function suggCard(sugg: Suggestion, i: number): string {
  return (
    `<div class="sugg lg lg-static anim" style="--d:${(0.2 + i * 0.05).toFixed(2)}s">` +
    `<span class="sev" style="background:${SEV_COLOR[sugg.level]}"></span>` +
    `<div><b>${sugg.title}</b><p>${sugg.body}</p><span class="why">${sugg.why}</span></div></div>`
  );
}

// mount() 只跑一次（router 快取式，見 router.ts），但每次切入本頁 router 都會在補上 .active 後呼叫
// show()。熱區 canvas 的尺寸取自容器當下的 getBoundingClientRect，故「重繪」這件事必須綁在 show()
// 而非 mount()：否則使用者切到別頁時調整視窗大小、再切回本頁（未動滑桿）canvas 會維持舊尺寸而被拉伸
// 變形。以下兩個模組層變數讓 show() 能在 mount() 之外取得「以目前滑桿值重繪」的能力（單一 dispatch
// 實例，無多實例風險，手法對齊 hero/index.ts 的 ovMap/ctxRef）。
let currentT = 30; // 目前滑桿值；slider input 時更新，show()/resize 用它重繪
let redraw: (() => void) | null = null; // = () => apply(currentT)，於 mount() 內指定

const s: Screen = {
  async mount(el, ctx) {
    const snap = await ctx.data.dispatch.snapshot();

    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '港邊人員視角 · MODULE 04',
        color: '#F5A54A',
        title: '短時微氣候 · 即時派工建議',
        badges: ['ConvLSTM 0-90 min'],
        source: 'mock',
        actionsHtml: metricPills(snap.metrics),
      }) +
      template
        .replace('<!--SUGGESTIONS-->', snap.suggestions.map(suggCard).join(''))
        .replace('__WINDS__', snap.winds.join(',')) +
      '</div>';

    const heat = initHeat(el.querySelector('#heat') as HTMLCanvasElement);
    const slider = el.querySelector<HTMLInputElement>('#dispTime');
    const clock = el.querySelector<HTMLElement>('#dclock');
    const read = el.querySelector<HTMLElement>('#dispRead');

    // 讀數規則逐字對齊基準檔 updDisp()：雨量 >=70 強降雨／>=50 大雨／否則陣雨；
    // 風速 >=15 rose／>=13 amber／否則 teal（雨量沿用同一組門檻決定文字等級與顏色）。
    function apply(t: number): void {
      currentT = t; // 記住目前值，供 show()/resize 於 mount() 之外重繪
      heat.draw(t);
      const i = Math.floor(t / 10);
      const wind = snap.winds[i];
      const rain = snap.rains[i];
      const lvl = rain >= 70 ? '強降雨' : rain >= 50 ? '大雨' : '陣雨';
      const wc = wind >= 15 ? 'rosec' : wind >= 13 ? 'amberc' : 'tealc';
      const rc = rain >= 70 ? 'rosec' : rain >= 50 ? 'amberc' : 'tealc';
      if (clock) clock.textContent = '+' + t + ' min';
      if (read) {
        read.innerHTML =
          (t === 0 ? '現在' : '未來 ' + t + ' 分鐘') +
          '：港區平均風速 <b class="em">' + snap.winds[0] + ' → <span class="' + wc + '">' + wind + ' m/s</span></b>' +
          ' · 降雨機率 <b class="' + rc + '">' + rain + '%</b> · ' + lvl + '等級';
      }
    }

    slider?.addEventListener('input', () => apply(Number(slider.value)));

    // 供 show() 呼叫的重繪入口：以目前滑桿值重畫熱區 + 讀數列。首繪不在 mount() 做——mount() 執行當下
    // 這個 <section> 尚未加上 .active（router.go 先 await mount() 才補 class，見 router.ts），此時
    // .heatbox 的祖先鏈仍是 .screen{display:none}，量到的 getBoundingClientRect 是 0×0。router 在補上
    // .active 之後才呼叫 show()（含首次進入），屆時 section 已可見、canvas 量得到正確尺寸——首繪與每次
    // 重新進入都交給 show() 一手包辦，語意單一、不需 rAF。
    redraw = () => apply(currentT);

    // 使用者正在本頁時調整視窗大小才需即時重排；切到別頁後的 resize 由回頁時的 show() 補繪即可，
    // 故加一道 .active 守門避免對背景頁做多餘運算。
    addEventListener('resize', () => {
      if (el.classList.contains('active')) apply(currentT);
    });

    // #dispTime 是掛載後才插入 DOM，錯過 Kit 開機那次掃描，--lg-fill 填色會卡在 CSS 預設 50%、
    // 不會隨拖曳更新，需手動補跑一次 behaviors.slider（對齊 carbon 對 .lg-tabs、twin 對
    // #twinTime 的同一種補跑手法）。
    if (slider) {
      try {
        (window.LiquidGlass.behaviors as { slider?: (el: Element) => void }).slider?.(slider);
      } catch {
        /* Kit 缺 behaviors.slider 時降級：原生 range input 仍可拖曳，只是沒有液滴填色動畫 */
      }
    }
  },

  // router 每次切入本頁（含首次，於 mount() 之後）都會在補上 .active 後呼叫 show()，此時 section
  // 已可見、熱區 canvas 量得到正確尺寸；以目前滑桿值重繪，一併涵蓋「首次進入」與「切走時 resize 過、
  // 再切回」兩種情境（見上方 redraw 註解）。mount() 尚未跑完前 redraw 為 null（不會發生：router 先
  // await mount() 才呼叫 show()），仍以可選鏈保險。
  show() {
    redraw?.();
  },
};

export default s;

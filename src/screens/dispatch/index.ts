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

    // mount() 執行當下這個 <section> 尚未加上 .active（router.go 先 await mount() 才補 class，
    // 見 router.ts），此時 .heatbox 的祖先鏈仍是 .screen{display:none}，量到的
    // getBoundingClientRect 是 0×0——若在這裡同步呼叫 apply(30) 會把 canvas 實際畫成 0×0（等同
    // hero 的 ovMap 為何把首次 paint() 延後到 show() 才做的同一個問題）。router.go() 在
    // mount() 的 promise resolve 後、下一次瀏覽器繪製前就會同步補上 .active，故用一個 rAF 把
    // 首次 apply 排到「下一幀」執行，屆時 section 必已是 .active，量到正確尺寸。
    requestAnimationFrame(() => apply(30));

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
};

export default s;

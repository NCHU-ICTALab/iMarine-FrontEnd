/* Twin screen 外殼膠合 — Task 8。
   markup 搬自基準檔 docs/preview/preview-src-v3.html 的 <!-- ══════════ 孿生 ══════════ -->：
   float-tl 標頭、float-r 四張浮動面板（Pareto 候選方案／KPI／泊位甘特／情境切換）、底部 tline 時間軸。
   這些選擇器（.float-tl/.float-r/.tline/.gantt/.gaxis/.scn/.panel）在 Task 1 已整批複製進 tokens.css，
   本檔不必也不寫版面 CSS。不用 screenHeader/.swrap——twin 是滿版浮動玻璃頁（見 task-8 ambiguity
   resolution #2），基準檔的主視覺點雲在此改為 iframe，嵌入 LiDAR kaohsiung-port 範例。 */

import type { Screen } from '../types';
import template from './twin.html?raw';

const s: Screen = {
  mount(el, ctx) {
    el.innerHTML = template;

    const iframe = el.querySelector<HTMLIFrameElement>('#twinFrame');
    const fallback = el.querySelector<HTMLElement>('#twinFallback');
    // iframe src 延後到 mount 才設定（lazy：本 screen 只 mount 一次，router 快取 DOM，離開再回來
    // 不重載 iframe）。降級提示卡預設可見。
    // 實測確認 iframe.onload 不可靠：LiDAR dev server 未啟動時（net::ERR_CONNECTION_REFUSED），
    // Chromium 仍會把該次導覽失敗的內建錯誤頁當成「載入完成」而觸發 onload，導致提示卡被提早收起、
    // 畫面只剩一塊空白 iframe（見 task-8-report 的 Chromium 實測記錄）。改用背景 fetch 探測 LiDAR
    // 埠是否有人聽：no-cors 模式下只要 TCP 連得上就會 resolve（即使回應本身不透明也算數，不看內容/
    // 標頭），連線被拒或逾時才會 reject——用這個訊號才是可靠的「伺服器是否啟動」依據，據此決定提示卡
    // 顯示或收起，不依賴 onload。
    if (iframe) {
      iframe.src = ctx.data.twin.url;
      fetch(ctx.data.twin.url, { mode: 'no-cors', cache: 'no-store' })
        .then(() => fallback?.setAttribute('hidden', ''))
        .catch(() => {
          fallback?.removeAttribute('hidden');
          // 光是把提示卡疊在 iframe 上面還不夠：導覽失敗的 iframe 本身仍是一塊不透明的空白錯誤頁，
          // 佔滿 inset:0，z-index 只決定同層級元素疊放順序，不會讓 iframe 自己的畫面變透明——
          // 卡片周圍還是會被那塊空白蓋住，看不到背景點雲。探測失敗時把 iframe 整個 display:none，
          // 才會露出真正的 body 背景（#harbor 點雲 + glowfx + veil），對齊基準檔的退回模式視覺。
          iframe.style.display = 'none';
        });
    }

    // 時間軸：input → 更新 NOW +HH:MM 標籤 + KPI 的 data-lg-value（彈簧動畫交給 liquid-glass.js 既有的
    // MutationObserver，見 router.ts 已對本 section 跑過一次 behaviors.stats()）+ 通知背景點雲位移
    // （iframe 顯示中此效果被蓋住，退回 fallback 模式時才看得到——對齊基準檔 twinOffset 的語意）。
    const slider = el.querySelector<HTMLInputElement>('#twinTime');
    const clock = el.querySelector<HTMLElement>('#tclock');
    const kpiWait = el.querySelector<HTMLElement>('#kpi-wait');
    const kpiCo2 = el.querySelector<HTMLElement>('#kpi-co2');
    slider?.addEventListener('input', () => {
      const h = parseFloat(slider.value);
      const hh = String(Math.floor(h)).padStart(2, '0');
      const mm = h % 1 ? '30' : '00';
      if (clock) clock.textContent = 'NOW +' + hh + ':' + mm;
      // 公式逐字對齊基準檔 twinTime 的 input handler（2.7±0.6hr / 4390±260t 正弦擺動，純示意數字）。
      kpiWait?.setAttribute('data-lg-value', String(2.7 + Math.sin((h / 24) * Math.PI * 2) * 0.6));
      kpiCo2?.setAttribute('data-lg-value', String(Math.round(4390 + Math.sin((h / 24) * Math.PI * 2 + 1) * 260)));
      ctx.background.setTwinOffset(h);
    });
    // Kit 的 init() 開機時已掃過全頁 input.lg-slider__input 一次；#twinTime 是本 screen 掛載後才插入
    // DOM，錯過那次掃描，--lg-fill（滑桿填色）不會跟著拖曳更新（卡在 CSS 預設 50%），需手動補跑一次
    // behaviors.slider（對齊 carbon/index.ts 對 .lg-tabs pill 的同一種補跑手法）。
    if (slider) {
      try {
        (window.LiquidGlass.behaviors as { slider?: (el: Element) => void }).slider?.(slider);
      } catch {
        /* Kit 缺 behaviors.slider 時降級：原生 range input 仍可拖曳，只是沒有液滴填色動畫 */
      }
    }

    // 情境切換：active 互斥 + toast，逐字對齊基準檔 .scn 點擊處理。
    el.querySelectorAll<HTMLButtonElement>('.scn').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.scn').forEach((x) => x.classList.toggle('on', x === btn));
        ctx.ui.toast({ title: '情境已套用', message: `「${btn.textContent}」重新推演未來 24 小時` });
      });
    });
  },
};

export default s;

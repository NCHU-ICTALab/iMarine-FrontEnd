/* Carbon screen 外殼膠合 — Task 7。
   把 PoC 原本 topbar 的三件套（工作台/稽核 lg-tabs + 鏈路健康 chip + 批次發行鈕）以「原 id 不變」
   搬進 shell 標題列（screenHeader 的 actionsHtml）。因為 header 與 carbon.html 都被注入同一個
   section root（#s-carbon），initCarbon 內 root-scoped 的 byId/qs/qsa 就能照樣找到 #nav-tabs /
   #health-chip / #btn-issue-nav 以及所有 stat / page / modal 元素——PoC 腳本一行邏輯都不用改。 */

import type { Screen } from '../types';
import { screenHeader } from '../../ui/components';
import carbonHtml from './carbon.html?raw';
import './carbon.css';
import { initCarbon } from './carbon';

// 三件套 markup 逐字複製自 PoC ui/index.html 第 167-174 行（去掉 navbar 專用的 brand 與 spacer，
// spacer 由 screenHeader 自帶），id / class / 屬性（data-page, role, data-lg, data-lg-open, disabled）全數保留。
const TRIO = `<div class="lg lg-tabs" data-lg role="tablist" id="nav-tabs">
  <span class="lg-tabs__pill"></span>
  <button class="lg-tabs__tab is-active" role="tab" data-page="workbench">工作台</button>
  <button class="lg-tabs__tab" role="tab" data-page="audit">稽核</button>
</div>
<span class="lg-chip" id="health-chip"><span class="led"></span><span id="health-text">連線中…</span></span>
<button class="lg lg-btn lg-btn--sm lg-btn--primary" data-lg id="btn-issue-nav" data-lg-open="#m-issue" disabled>批次發行</button>`;

const s: Screen = {
  mount(el, ctx) {
    // .swrap = shell 標準版心（左內距讓開固定 rail、置中），對齊基準檔碳權頁結構；
    // 內含 shell 標題列（含三件套）＋ PoC 內容（stat band / 工作台 / 稽核 / drawer / modals）。
    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '航港局視角 · MODULE 01 · IMARINE SU EXCHANGE',
        color: '#E9BC63',
        title: '碳權代幣化交易',
        badges: ['TCX 海運合規專區 PoC'],
        source: 'live',
        sourceLabel: '本地模擬鏈 PoC',
        actionsHtml: TRIO,
      }) +
      carbonHtml +
      '</div>';

    initCarbon(el, ctx.data.carbon.base);

    // Kit 的 init() 在開機時掃描一次 .lg-tabs；碳權頁此刻才掛載，故標題列 tabs 的液滴 pill 與 is-active
    // 需在此補跑 behaviors.tabs。modal 為 document 委派（開機已註冊）、stat/chart 由 router 的
    // behaviors.stats(section) 掃描、[data-lg] 折射由 router attach——皆已涵蓋，唯 tabs 是逐元件初始化的缺口。
    el.querySelectorAll('.lg-tabs').forEach((t) => {
      try {
        (window.LiquidGlass.behaviors as { tabs?: (el: Element) => void }).tabs?.(t);
      } catch {
        /* Kit 缺 behaviors.tabs 時降級：PoC 自己的 switchPage 仍會切頁，只是少了 pill 動畫 */
      }
    });
  },
};

export default s;

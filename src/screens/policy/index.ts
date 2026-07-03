/* Policy screen 外殼膠合 — Task 12.
   markup 搬自基準檔 docs/preview/preview-src-v3.html 的 <!-- ══════════ 政策報告 ══════════ -->：
   標頭改用 screenHeader；議題列（.topic，含「重新生成」鈕）、報告五段與 Grounding 儀表/來源清單
   皆由 snapshot 動態產生——policy.html 只留 __TOPIC__ / <!--SECTIONS--> / __GROUNDING__ /
   __GNOTE__ / __SRCCOUNT__ / <!--SOURCES--> 六個佔位標記（單值用 __X__、清單用 <!--X-->，對齊
   dispatch/epidemic 既有手法），不手刻固定筆數/固定文字的報告段落或來源列。
   policy 是 'doc' 頁（見 registry.ts 的 mode:'doc'，背景罩幕壓暗），用 .swrap 版心。
   報告段落：sections[].html 為 Task 3 契約定義的「段落內文」（heading 是獨立欄位），且已含
   <span class="cite" data-src="n">n</span> 引用標記，故 <p> 內容原樣塞入、不逃逸
   （逃逸會把 cite span 變成字面文字，且 datatypes.ts 註解明講 html 內含該 span）。 */

import type { Screen } from '../types';
import { screenHeader } from '../../ui/components';
import type { PolicySnapshot } from '../../data/types';
import template from './policy.html?raw';

type Section = PolicySnapshot['sections'][number];
type SourceItem = PolicySnapshot['sources'][number];

// 段落：heading 與 html（段落內文，已含 cite span）兩個獨立欄位拼回基準檔的 <h3>+<p> 兩件式。
function sectionHtml(sec: Section): string {
  return `<h3>${sec.heading}</h3><p>${sec.html}</p>`;
}

// 來源列：[no] + 名稱 + 分級 · 日期，逐字對齊基準檔 .srcrow 結構；data-no 供引用連動查詢。
function sourceRow(s: SourceItem): string {
  return (
    `<div class="srcrow" data-no="${s.no}"><span class="no">[${s.no}]</span>` +
    `<div>${s.name}<div class="meta">${s.grade} · ${s.date}</div></div></div>`
  );
}

const s: Screen = {
  async mount(el, ctx) {
    const snap = await ctx.data.policy.snapshot();

    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '航港局視角 · MODULE 02',
        color: '#38BDF8',
        title: 'AI 政策輔助報告',
        badges: ['LLM + RAG · Grounding'],
        source: 'mock',
      }) +
      template
        .replace('__TOPIC__', snap.topic)
        .replace('<!--SECTIONS-->', snap.sections.map(sectionHtml).join(''))
        .replace('__GROUNDING__', String(snap.grounding))
        .replace('__GNOTE__', snap.groundingNote)
        .replace('__SRCCOUNT__', String(snap.sources.length))
        .replace('<!--SOURCES-->', snap.sources.map(sourceRow).join('')) +
      '</div>';

    // Grounding 儀表（.lg-gauge）由 router 首掛後呼叫的 behaviors.stats(section) 掃描接手
    // （見 router.ts 的既有呼叫，Task 5 補上），本檔不需另呼叫 Kit API。

    // ══ 政策：生成動畫 + 引用連動 ══ 逐字對齊基準檔 /* 政策：生成動畫 + 引用連動 */；
    // 查詢範圍收斂在 el（本頁 section），同 dispatch/epidemic/alert 既有慣例（快取式路由下
    // 其他頁 DOM 仍在畫面外，不應查到本頁範圍之外）。
    const genBtn = el.querySelector<HTMLButtonElement>('#genBtn');
    const reportBody = el.querySelector<HTMLElement>('#reportBody');
    genBtn?.addEventListener('click', () => {
      if (!reportBody || reportBody.classList.contains('skl')) return; // 生成中不可重入，同基準檔
      reportBody.classList.add('skl'); // #reportBody.skl → blur(8px)+opacity .3（見 tokens.css）
      genBtn.textContent = '生成中…';
      setTimeout(() => {
        reportBody.classList.remove('skl');
        genBtn.textContent = '重新生成';
        // mock 情境無法重新計算「量化數字」總數，改用 snapshot 既有兩個 grounding 欄位組字串，
        // 語意對齊基準檔寫死的 '30 個量化數字 · Grounding 93%'（同為「可追溯統計 · 百分比」兩段式，
        // 且與右欄常駐顯示的文字一致，不臆造新數字）。
        ctx.ui.toast({
          title: '報告已生成',
          message: `${snap.groundingNote} · Grounding ${snap.grounding}%`,
          duration: 3600,
        });
      }, 1400);
    });

    el.querySelectorAll<HTMLElement>('.cite').forEach((c) => {
      const row = el.querySelector(`.srcrow[data-no="${c.getAttribute('data-src')}"]`);
      if (!row) return;
      c.addEventListener('mouseenter', () => row.classList.add('hl'));
      c.addEventListener('mouseleave', () => row.classList.remove('hl'));
    });
  },
};

export default s;

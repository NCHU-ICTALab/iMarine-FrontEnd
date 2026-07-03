/* Alert screen 外殼膠合 — Task 11.
   markup 搬自基準檔 docs/preview/preview-src-v3.html 的 <!-- ══════════ 警報 ══════════ -->：
   標頭改用 screenHeader（模擬推播鈕塞進 actionsHtml）；四張 KPI 卡由 statRow() 產生；篩選 chips
   （全部/疫情/氣象/解除）與推播規則面板三顆 switch 為固定內容（基準檔字面本就非資料驅動，型別
   AlertSnapshot 也無對應欄位）；feed 六列與手機 sms 泡泡改由 snapshot 動態產生——alert.html 只留
   <!--STATS--> / <!--FEED--> / <!--SMS--> 三個佔位標記（對齊 hero.html 的 <!--STATS--> 與
   dispatch.html 的 <!--SUGGESTIONS--> 手法），不手刻固定筆數的卡片。
   alert 是標準 'ov' 頁（見 registry.ts 的 mode:'ov'），用 .swrap 版心，不是滿版。 */

import type { Screen } from '../types';
import { screenHeader, statRow, type StatItem } from '../../ui/components';
import type { AlertSnapshot } from '../../data/types';
import template from './alert.html?raw';

type Feed = AlertSnapshot['feed'][number];
type Sms = AlertSnapshot['sms'][number];

// KPI 四卡欄位對應：today→今日推播/則、reached→觸及人數/人、avgSec→平均送達/s（1 位小數）、
// pending→待確認回報/人——逐字對齊基準檔 .stats4 四張卡的 label/data-lg-suffix/-decimals。
function kpiItems(snap: AlertSnapshot): StatItem[] {
  const { kpi } = snap;
  return [
    { label: '今日推播', value: kpi.today, suffix: ' 則' },
    { label: '觸及人數', value: kpi.reached, suffix: ' 人' },
    { label: '平均送達', value: kpi.avgSec, decimals: 1, suffix: ' s' },
    { label: '待確認回報', value: kpi.pending, suffix: ' 人' },
  ];
}

// 嚴重度 → 色彩，對齊基準檔 .alertrow .sev 的 inline background。sev 本身即色彩關鍵字
// （rose/amber/flame/ok，見 task-11-brief 的資料契約備註），直接查表即可、非等級再轉譯；
// AlertSnapshot['feed'][number]['sev'] 型別為裸 string（非 union），故用 Record<string,string>
// 廣義查表＋?? 預設色收尾，防未知關鍵字時仍有合理降級色彩。
const SEV_COLOR: Record<string, string> = {
  rose: 'var(--rose)',
  amber: 'var(--amber)',
  flame: 'var(--flame)',
  ok: 'var(--lg-accent)',
};

// stagger 進場延遲比照基準檔六列 --d:.1s/.15s/.2s/.25s/.3s/.35s（同 dispatch/epidemic 卡片的手法）。
function feedRow(item: Feed, i: number): string {
  return (
    `<div class="alertrow lg lg-static anim" data-cat="${item.cat}" style="--d:${(0.1 + i * 0.05).toFixed(2)}s">` +
    `<span class="sev" style="background:${SEV_COLOR[item.sev] ?? 'var(--ink-40)'}"></span>` +
    `<div><b>${item.title}</b><p>${item.body}</p></div><time>${item.time}</time></div>`
  );
}

// snapshot.sms[].text 是完整訊息字串、含開頭方括號標籤（如「[港區作業警報]泊位108…」）；基準檔把
// 這段標籤粗體另起一行（<b>[…]</b>其餘文字），但 mock JSON 未拆成兩欄位（型別只有 text/old），
// 故渲染層以正則切出開頭方括號 group 補上 <b>，其餘文字原樣接續——與「模擬推播」新插入泡泡（見
// 下方 demoToast handler）套用同一種粗體視覺，兩者不會顯得不一致。
function smsHtml(text: string): string {
  const m = text.match(/^(\[[^\]]*\])([\s\S]*)$/);
  return m ? `<b>${m[1]}</b>${m[2]}` : text;
}

function smsBubble(item: Sms): string {
  return `<div class="sms${item.old ? ' old' : ''}">${smsHtml(item.text)}</div>`;
}

const DEMO_BTN = '<button class="lg lg-btn lg-btn--accent lg-btn--sm" data-lg id="demoToast">模擬推播</button>';

const s: Screen = {
  async mount(el, ctx) {
    const snap = await ctx.data.alert.snapshot();

    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '港邊人員視角 · MODULE 06',
        color: '#FF7A59',
        title: '自動警報推播',
        badges: ['Cell Broadcast · 細胞簡訊'],
        source: 'mock',
        actionsHtml: DEMO_BTN,
      }) +
      template
        .replace('<!--STATS-->', statRow(kpiItems(snap)))
        .replace('<!--FEED-->', snap.feed.map(feedRow).join(''))
        .replace('<!--SMS-->', snap.sms.map(smsBubble).join('')) +
      '</div>';

    // 警報：分類篩選——逐字對齊基準檔 /* 警報：分類篩選 */：點 chip 切換 is-on，並依 data-cat
    // 顯示/隱藏 feed 列（cat==='all' 時全部顯示）。查詢範圍收斂在 el（本頁 section）而非基準檔
    // 原本掛在整個 document 的寫法——shell 是快取式路由，其他頁的 DOM 仍留在畫面外，query 應以
    // el 為界，避免無謂波及（目前雖只有本頁有 .fbar/.alertrow，仍以此為保險慣例，同 dispatch/epidemic）。
    el.querySelectorAll('.fbar .fchip').forEach((ch) => {
      ch.addEventListener('click', () => {
        el.querySelectorAll('.fbar .fchip').forEach((x) => x.classList.toggle('is-on', x === ch));
        const cat = ch.getAttribute('data-cat');
        el.querySelectorAll('.alertrow').forEach((row) => {
          row.classList.toggle('hide', cat !== 'all' && row.getAttribute('data-cat') !== cat);
        });
      });
    });

    // ══ 模擬推播 ══ 逐字對齊基準檔行為：toast + 手機 buzz（先移除 buzz class、強制 reflow
    // （void offsetWidth）、再加回，讓連續點擊都能重新觸發同一個 CSS animation）＋插入新
    // .sms.pop 泡泡（文案為基準檔演練固定文案——這是「模擬」鈕本身的示範內容，不是 snapshot
    // 既有資料，故不從 snap.sms 取值），上限 3 則、超出即移除最舊一則。
    const phone = el.querySelector<HTMLElement>('#phoneMock');
    const phoneScr = el.querySelector<HTMLElement>('#phoneScr');
    el.querySelector('#demoToast')?.addEventListener('click', () => {
      ctx.ui.toast({ title: '細胞簡訊已送出', message: '港區西側 210 名作業人員 · 疫情橙級警報', duration: 4200 });
      if (!phone || !phoneScr) return;
      phone.classList.remove('buzz');
      void phone.offsetWidth;
      phone.classList.add('buzz');
      const sms = document.createElement('div');
      sms.className = 'sms pop';
      sms.innerHTML = '<b>[港區作業警報]</b>模擬演練：泊位108疫情橙級推播測試，收到訊息之作業人員無需回報。';
      phoneScr.insertBefore(sms, phoneScr.firstChild);
      while (phoneScr.children.length > 3) phoneScr.lastElementChild?.remove();
    });

    // .lg-switch 是「純 CSS」開關（見 liquid-glass.css 開頭註解）：checked/track/thumb 的基本
    // 切換靠 :checked 相鄰選擇器即可運作，不需 JS。但 goo 液滴裝飾層（behaviors.switchTension）
    // 只在開機 boot() 當下對 document 掃描一次（liquid-glass.js:1529），本頁三顆 switch 是在那
    // 之後才掛載、錯過那次掃描，需比照 carbon 補跑 tabs／dispatch 補跑 slider 的手法手動補一次
    // （純視覺加分，缺了不影響開關本身可否切換，故 try/catch 靜默降級）。
    el.querySelectorAll('.lg-switch').forEach((sw) => {
      try {
        (window.LiquidGlass.behaviors as { switchTension?: (el: Element) => void }).switchTension?.(sw);
      } catch {
        /* Kit 缺 behaviors.switchTension 時降級：checkbox 仍可切換，只是少了 goo 液滴動畫 */
      }
    });
  },
};

export default s;

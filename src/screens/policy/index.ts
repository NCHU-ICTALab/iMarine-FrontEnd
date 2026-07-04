/* Policy screen — 政策情報中心（2026-07-04 spec 改版）。
   互動基準：docs/preview/preview-policy-redesign.html（v7）。
   中欄 = NotebookLM 式對話串（報告為產出卡）；本檔為膠合層，
   時序排程走 ./generate 的 runTimeline（可測），資料走 ctx.data.policy.snapshot()。 */
import type { Screen, ScreenCtx } from '../types';
import type { PolicyBrief, PolicyQA, PolicySource } from '../../data/types';
import { screenHeader } from '../../ui/components';
import { runTimeline, type TimelineHandle } from './generate';
import template from './policy.html?raw';
import './policy.css';

const MODEL = { local: '地端 LLM · 8B 量化版', cloud: '雲端 API · 旗艦模型' } as const;

let briefs: PolicyBrief[] = [];
let inflowPool: PolicyBrief[] = [];
let globalQa: PolicyQA[] = [];
let curId = '';
let llm: keyof typeof MODEL = 'local';
let sectionEl: HTMLElement;
let sCtx: ScreenCtx;

/* runtime 狀態（不污染 snapshot 物件）：chips 用掉的索引、未讀、滑入一次性旗標 */
interface BriefState { used: Set<number>; unread: boolean; fresh: boolean }
const state = new Map<string, BriefState>();
function st(id: string): BriefState {
  let s = state.get(id);
  if (!s) { s = { used: new Set(), unread: false, fresh: false }; state.set(id, s); }
  return s;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const ANSMS = { local: [900, 1100], cloud: [500, 700] } as const;
let answering = false;
let generating = false; // Task 6 重新生成使用；與追問互斥
let activeTimeline: TimelineHandle | null = null;

function cancelTimers(): void {
  activeTimeline?.cancel();
  activeTimeline = null;
  answering = false;
  generating = false;
  const btn = sectionEl?.querySelector<HTMLButtonElement>('#genBtn');
  if (btn) btn.textContent = '重新生成';
}

const $ = <T extends HTMLElement>(sel: string) => sectionEl.querySelector(sel) as T;
function briefById(id: string): PolicyBrief | undefined {
  return briefs.find((b) => b.id === id);
}
function nowStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ── 收件匣 ── */
function dotColor(b: PolicyBrief): string {
  if (b.type === 'policy') return 'var(--cyan)';
  if (b.type === 'daily') return 'var(--lg-accent)';
  return b.severity === 'high' ? 'var(--rose)' : 'var(--amber)';
}
function typeName(b: PolicyBrief): string {
  return b.type === 'policy' ? '政策' : b.type === 'daily' ? '日報' : '突發';
}
function renderInbox(): void {
  const list = $('#inboxList');
  list.innerHTML =
    `<button class="ib gib${curId === 'global' ? ' on' : ''}" role="listitem" data-id="global"` +
    ` title="跨全部情報來源直接提問"><i class="idot"></i><span>綜合對話 · 全部來源</span></button>` +
    '<hr class="ibsep">' +
    briefs.map((b) => {
      const s = st(b.id);
      return `<button class="ib${b.id === curId ? ' on' : ''}${s.fresh ? ' slidein' : ''}" role="listitem"` +
        ` data-id="${b.id}" title="${typeName(b)} · ${b.time}">` +
        `<i class="idot" style="--c:${dotColor(b)}"></i><span>${b.title}</span>` +
        (s.unread ? '<i class="udot" aria-label="未讀"></i>' : '') + '</button>';
    }).join('');
  briefs.forEach((b) => { st(b.id).fresh = false; }); // 滑入動畫只播一次
}

/* ── 三類版型（產出卡內文） ── */
function bodyHtml(b: PolicyBrief): string {
  if (b.type === 'incident') {
    let h = `<h3>一、事件摘要</h3><p>${b.summary}</p>` +
      `<h3>二、歷史相似案例</h3><div class="cases${b.cases.length === 1 ? ' one' : ''}">` +
      b.cases.map((c) =>
        `<div class="case"><b>${c.title}</b><span class="dur">${c.duration}</span>` +
        `<p><span class="k">處置</span> ${c.action}<br><span class="k">成效</span> ${c.outcome}` +
        `<span class="cite" data-src="${c.cite}">${c.cite}</span></p></div>`).join('') + '</div>';
    let n = 3;
    if (b.impact) { h += `<h3>三、對高雄港影響評估</h3><p>${b.impact}</p>`; n = 4; }
    h += `<h3>${['一', '二', '三', '四'][n - 1]}、建議行動</h3><ol>` +
      b.actions.map((a) => `<li>${a}</li>`).join('') + '</ol>';
    return h;
  }
  if (b.type === 'policy') {
    return b.sections.map((s) => `<h3>${s.heading}</h3><p>${s.html}</p>`).join('');
  }
  return '<ol class="ditems">' +
    b.items.map((it) => `<li>${it.text}<span class="cite" data-src="${it.cite}">${it.cite}</span></li>`).join('') +
    '</ol><div class="watch"><span class="wlbl">→ 建議關注</span>' +
    (b.watch.goto
      ? `<button class="wlink" data-goto="${b.watch.goto}">${b.watch.text}</button>`
      : `<span>${b.watch.text}</span>`) + '</div>';
}
function reportLabel(b: PolicyBrief): string {
  return b.type === 'incident' ? '結構化產出 · 決策建議報告'
    : b.type === 'daily' ? '結構化產出 · 每日晨報' : '結構化產出 · 政策評估報告';
}

/* ── Grounding 窄 bar ── */
function renderGbar(value: number, note: string): void {
  $('#gVal').textContent = `${value}%`;
  $('#gNote').textContent = note;
  const fill = $('#gFill');
  if (reduced()) { fill.style.width = `${value}%`; return; }
  fill.style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${value}%`; }));
}

/* ── 右欄來源（平面清單；global 分支見 Task 7） ── */
function srcRowHtml(s: PolicySource, key: string): string {
  return `<div class="srcrow${s.checked ? '' : ' off'}" data-no="${s.no}">` +
    `<input type="checkbox" class="schk" ${key}${s.checked ? ' checked' : ''}` +
    ` aria-label="${s.name} 參與生成">` +
    `<span class="no">[${s.no}]</span>` +
    `<div><span class="sname">${s.name}</span>${s.checked ? '' : '<span class="skip">未參與</span>'}` +
    `<div class="meta">${s.cat} · ${s.date}</div></div></div>`;
}
function renderSources(b: PolicyBrief): void {
  $('#srcCount').textContent = String(b.sources.length);
  const list = $('#srcList');
  list.innerHTML = b.sources.map((s, i) => srcRowHtml(s, `data-i="${i}"`)).join('');
  list.querySelectorAll<HTMLInputElement>('.schk').forEach((chk) => {
    chk.addEventListener('change', () => {
      const s = b.sources[Number(chk.getAttribute('data-i'))];
      s.checked = chk.checked;
      renderSources(b); // 灰列/未參與即時更新；影響下次生成的「閱讀 k/n」計數
    });
  });
}

/* ── 引用連動（hover 高亮 + 點擊捲動；global 群組擴充見 Task 7） ── */
function bindCites(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.cite').forEach((c) => {
    if ((c as HTMLElement & { _bound?: boolean })._bound) return;
    (c as HTMLElement & { _bound?: boolean })._bound = true;
    const no = c.getAttribute('data-src');
    const row = () => $('#srcList').querySelector<HTMLElement>(`.srcrow[data-no="${no}"]`);
    c.addEventListener('mouseenter', () => row()?.classList.add('hl'));
    c.addEventListener('mouseleave', () => row()?.classList.remove('hl'));
    c.addEventListener('click', () => {
      const r = row();
      if (!r) return;
      r.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      r.classList.add('hl');
      setTimeout(() => r.classList.remove('hl'), 2000);
    });
  });
}

/* ── 對話串（產出卡 + 追問 chips/輸入列） ── */
function renderThread(b: PolicyBrief): void {
  const thread = $('#thread');
  thread.innerHTML =
    `<div class="msg ai reportcard"><div class="mhead"><i></i>${reportLabel(b)}</div>` +
    `<div id="reportBody">${bodyHtml(b)}</div></div>`;
  bindCites(thread);
  thread.querySelector<HTMLButtonElement>('.wlink')?.addEventListener('click', function () {
    select(this.getAttribute('data-goto')!);
  });
  renderChips(b.qa, b.id);
  ($('#qinput') as HTMLInputElement).value = '';
}

/* ── 追問（chips 走預錄劇本；自由輸入回覆誠實示範說明） ── */
function renderChips(qa: PolicyQA[], usedKey: string): void {
  $('#qchips').innerHTML = qa
    .map((p, i) => (st(usedKey).used.has(i) ? '' : `<button class="qchip" data-qi="${i}">${p.q}</button>`))
    .join('');
}
function scrollThread(): void {
  const t = $('#thread');
  t.scrollTop = t.scrollHeight;
}
function ask(pair: PolicyQA, qi: number | null): void {
  if (answering || generating) return;
  const model = MODEL[llm];
  answering = true;
  const thread = $('#thread');
  const uq = document.createElement('div');
  uq.className = 'msg user';
  uq.textContent = pair.q; // 使用者輸入一律 textContent（XSS 安全）
  thread.appendChild(uq);
  if (qi !== null) { st(curId).used.add(qi); renderChips(currentQa(), curId); }

  const citeSet = new Set<string>();
  for (const m of pair.a.matchAll(/data-src="(\d+)"/g)) citeSet.add(m[1]);

  const finish = () => {
    answering = false;
    activeTimeline = null;
    thread.querySelector('.msg.thinking')?.remove();
    const am = document.createElement('div');
    am.className = 'msg ai';
    am.innerHTML = `<p>${pair.a}</p><div class="mfoot">${model} · ${nowStr()}` +
      (citeSet.size ? ` · 引用 ${citeSet.size} 筆` : '') + '</div>';
    thread.appendChild(am);
    bindCites(am);
    scrollThread();
  };

  if (reduced()) { finish(); return; } // reduced-motion：跳過思考氣泡直通回答

  const think = document.createElement('div');
  think.className = 'msg ai thinking';
  think.innerHTML = '<i class="sdot"></i><span>檢索 iMarine 資料庫…</span>';
  thread.appendChild(think);
  scrollThread();
  const ms = ANSMS[llm];
  activeTimeline = runTimeline(
    [{ at: ms[0], run: () => { const sp = think.querySelector('span'); if (sp) sp.textContent = '綜合回答與 Grounding 驗證…'; } }],
    ms[0] + ms[1],
    finish,
  );
}
function currentQa(): PolicyQA[] {
  return briefById(curId)?.qa ?? []; // Task 7 擴充 global 分支
}
function sendFree(): void {
  const input = $('#qinput') as HTMLInputElement;
  const t = input.value.trim();
  if (!t || answering || generating) return;
  input.value = '';
  ask({
    q: t,
    a: '此為示範環境，自由輸入的問題將由正式版 LLM + RAG 依 iMarine 五類資料庫即時回答並附引用；您可先點選下方建議追問體驗完整流程。',
  }, null);
}

/* ── 條目切換 ── */
function select(id: string): void {
  cancelTimers(); // 切條目取消進行中的回答/生成
  const b = briefById(id);
  if (!b) return; // global 分支 Task 7 補
  curId = id;
  st(id).unread = false;
  ($('#genBtn') as HTMLElement).style.display = '';
  renderInbox();
  $('#rTitle').textContent = b.title + (b.type === 'incident' ? ' — 決策建議報告' : '');
  renderThread(b);
  renderGbar(b.grounding, b.groundingNote);
  renderSources(b);
}

const s: Screen = {
  async mount(el, ctx) {
    sectionEl = el;
    sCtx = ctx;
    const snap = await ctx.data.policy.snapshot();
    briefs = snap.briefs;
    inflowPool = snap.inflow;
    globalQa = snap.globalQa;

    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '航港局視角 · MODULE 02',
        color: '#38BDF8',
        title: 'AI 政策輔助報告',
        // 本頁不顯示資料源 chip 與技術徽章（spec §2 標題列再減負）
        actionsHtml:
          '<nav class="llmswitch lg" data-lg aria-label="LLM 接口切換">' +
          '<button class="lbtn on" data-llm="local">地端部署</button>' +
          '<button class="lbtn" data-llm="cloud">雲端 API</button></nav>',
      }) +
      template +
      '</div>';

    // LLM 切換：只影響下一次生成/回答
    el.querySelectorAll<HTMLButtonElement>('.lbtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('on')) return;
        el.querySelectorAll('.lbtn').forEach((x) => x.classList.remove('on'));
        btn.classList.add('on');
        llm = btn.getAttribute('data-llm') as keyof typeof MODEL;
        ctx.ui.toast({
          title: '已切換 LLM 接口',
          message: `${llm === 'local' ? '地端部署' : '雲端 API'}（${MODEL[llm]}），下次生成生效`,
          duration: 3200,
        });
      });
    });

    // 收件匣點擊委派
    $('#inboxList').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.ib');
      if (btn) select(btn.getAttribute('data-id')!);
    });

    $('#qchips').addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest('.qchip');
      if (!c) return;
      const qi = Number(c.getAttribute('data-qi'));
      ask(currentQa()[qi], qi);
    });
    $('#qsend').addEventListener('click', sendFree);
    ($('#qinput') as HTMLInputElement).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendFree();
    });

    select(briefs[0].id);
  },
  hide() { cancelTimers(); },
};
export default s;

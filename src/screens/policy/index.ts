/* Policy screen — 政策情報中心（2026-07-04 spec 改版）。
   互動基準：docs/preview/preview-policy-redesign.html（v7）。
   中欄 = NotebookLM 式對話串（報告為產出卡）；本檔為膠合層，
   時序排程走 ./generate 的 runTimeline（可測），資料走 ctx.data.policy.snapshot()。 */
import type { Screen, ScreenCtx } from '../types';
import type {
  PolicyBrief, PolicyChatMsg, PolicyQA, PolicyReportResult, PolicySource,
} from '../../data/types';
import { screenHeader } from '../../ui/components';
import { getSetting, prefersReduced, setSetting, subscribe } from '../settings/storage';
import { applyLlmMode } from '../settings/sections/policy';
import { runTimeline, type TimelineHandle } from './generate';
import template from './policy.html?raw';
import './policy.css';

/* 接口切換的顯示名（地端/雲端）。實際模型 id 由後端 /api/chat 回傳，live 回答的 footer 照實顯示，
   不在此寫死型號，避免與後端設定不符（mock 情報為預錄展示，footer 僅標接口）。 */
const MODEL = { local: '地端部署', cloud: '雲端 API' } as const;

let briefs: PolicyBrief[] = [];
let inflowPool: PolicyBrief[] = [];
let globalQa: PolicyQA[] = [];
let curId = '';
let llm: keyof typeof MODEL = getSetting('policy.llmMode', 'local') as keyof typeof MODEL;
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

const reduced = () => prefersReduced();

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
// 後端 live 生成的晨報：可自由提問、chip 走真後端 /api/chat（非預錄劇本）。
const LIVE_BRIEF_ID = 'day-live';
function isLiveBrief(id: string): boolean { return id === LIVE_BRIEF_ID; }
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

/* ── 模擬情報流入：池內依序流入；池用畢下一次點擊重置並重新流入（demo 可循環） ── */
let flowIdx = 0;
let autoFlowArmed = false;
function flowIn(): void {
  if (flowIdx >= inflowPool.length) {
    // 重置：移除已流入條目；若正選中其一則退回第一條
    const removedCur = inflowPool.some((p) => p.id === curId);
    briefs = briefs.filter((b) => !inflowPool.includes(b));
    flowIdx = 0;
    if (removedCur) select(briefs[0].id);
  }
  const nb = inflowPool[flowIdx++];
  const s = st(nb.id);
  s.used = new Set(); // 重新流入時追問劇本重置
  s.unread = true;
  s.fresh = !reduced();
  briefs.unshift(nb);
  renderInbox();
  updateAfterInflow(); // Task 7 前為 no-op，Task 7 接 global 聯集同步
  sCtx.ui.toast({
    title: '偵測到新事件',
    message: `${nb.title} · 信心度 ${nb.type === 'incident' ? nb.confidence : '--'}% · 已自動生成決策建議`,
    duration: 4200,
  });
}
function updateAfterInflow(): void {
  if (curId !== 'global' || globalLive) return; // live 知識庫模式不被 mock 情報流入覆蓋
  buildUnion(); // 對話串不重置，只同步右欄與 gbar
  renderGbar(avgGrounding(), globalGbarNote());
  renderUnionSources();
}

/* 更新新聞：重抓 ae_news → 後端重生成晨報 → 用新晨報取代收件匣 daily 類並置頂。 */
async function refreshNews(): Promise<void> {
  const fn = sCtx.data.policy.refreshNews;
  if (!fn) return;
  const btn = $('#newsBtn') as HTMLButtonElement;
  if (btn.disabled) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '更新中…';
  const wasOnDaily = curId === 'day-live' || briefById(curId)?.type === 'daily';
  try {
    const live = await fn();
    briefs = [...live, ...briefs.filter((b) => b.type !== 'daily')];
    if (wasOnDaily) select(live[0]?.id ?? briefs[0]?.id ?? 'global');
    else renderInbox();
    sCtx.ui.toast({
      title: '新聞已更新',
      message: live.length ? '每日晨報已依最新新聞重新生成' : '目前無新聞可生成晨報',
      duration: 3600,
    });
  } catch {
    sCtx.ui.toast({
      title: '更新失敗',
      message: '後端連線失敗，請確認 rag-agent 已於 :8100 啟動',
      duration: 3600,
    });
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
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

/* ── 綜合對話（知識庫模式）：來源聯集 + 分組摺疊 + {{c:名稱}} 解析 ── */
const CATS = ['海運焦點新聞', '全球航運指數', '台灣數據統計', '航港法令', '替代能源專區', '自建知識庫'];
let globalUnion: PolicySource[] = [];
let globalHistory: PolicyChatMsg[] = []; // 綜合對話 live 模式的對話歷史（進入 global 時重置）
let globalLive = false;                   // 右欄目前是否為後端真實知識庫（否 = mock fallback）
const globalChecked = new Map<string, boolean>(); // key=來源名稱，跨切換保留
const expandedCats = new Set<string>();
let srcQuery = '';

function buildUnion(): void {
  const seen = new Set<string>();
  const list: PolicySource[] = [];
  for (const b of briefs) {
    for (const src of b.sources) {
      if (seen.has(src.name)) continue;
      seen.add(src.name);
      list.push({
        no: list.length + 1, name: src.name, cat: src.cat, date: src.date,
        checked: globalChecked.get(src.name) ?? true,
      });
    }
  }
  globalUnion = list;
}
function resolveTokens(html: string): string {
  return html.replace(/\{\{c:([^}]+)\}\}/g, (_, name: string) => {
    const s = globalUnion.find((x) => x.name === name);
    return s ? `<span class="cite" data-src="${s.no}">${s.no}</span>` : '';
  });
}
function catCounts(): string {
  const m = new Map<string, number>();
  for (const s of globalUnion) m.set(s.cat, (m.get(s.cat) ?? 0) + 1);
  return [...m.entries()].map(([k, v]) => `${k} ${v}`).join(' · ');
}
function avgGrounding(): number {
  return Math.round(briefs.reduce((a, b) => a + b.grounding, 0) / briefs.length);
}
function globalGbarNote(): string {
  return `跨 ${briefs.length} 條情報平均 · ${globalUnion.length} 筆來源就緒`;
}

/* 綜合對話總覽卡文案（live = 後端真實知識庫；mock = 情報聯集 fallback） */
function renderGlobalOverview(live: boolean): void {
  const head = live
    ? `已接入 ${globalUnion.length} 個知識庫（${catCounts()}）。`
    : `已就緒 ${briefs.length} 條情報、${globalUnion.length} 筆來源文件（${catCounts()}）。`;
  $('#thread').innerHTML =
    `<div class="msg ai reportcard"><div class="mhead"><i></i>知識庫總覽</div>` +
    `<p style="margin:0;color:var(--ink-60);font-size:13.5px">${head}` +
    '可勾選右欄來源後直接提問，回答皆附引用；也可點下方建議提問開始。</p></div>';
}

/* 載入右欄來源：優先打後端 /api/sources 顯示真實知識庫，失敗則退回 mock 情報聯集 */
async function loadGlobalSources(): Promise<void> {
  const kb = sCtx.data.policy.knowledgeBases;
  if (kb) {
    try {
      const list = await kb();
      if (curId !== 'global') return;                 // 載入期間被切走則放棄
      globalUnion = list.map((s, i) => ({
        ...s, no: i + 1, checked: globalChecked.get(s.name) ?? s.checked,
      }));
      globalLive = true;
      renderGlobalOverview(true);
      renderGbar(0, `${globalUnion.length} 個知識庫就緒 · 提問後顯示 Grounding`);
      renderUnionSources();
      return;
    } catch {
      // 後端不在 → 落回 mock，維持 demo 可用
    }
  }
  if (curId !== 'global') return;
  buildUnion();
  globalLive = false;
  renderGlobalOverview(false);
  renderGbar(avgGrounding(), globalGbarNote());
  renderUnionSources();
}

/* ── 分組摺疊來源面板（global 模式；一般條目仍用上方平面 renderSources） ── */
function setUnionChecked(s: PolicySource, on: boolean): void {
  s.checked = on;
  globalChecked.set(s.name, on);
}
function renderUnionSources(): void {
  $('#srcCount').textContent = String(globalUnion.length);
  const q = srcQuery.trim();
  let html = `<input class="ssearch" id="ssearch" type="text" placeholder="搜尋來源名稱…"` +
    ` value="${srcQuery.replace(/"/g, '&quot;')}" aria-label="搜尋來源">`;
  for (const cat of CATS) {
    const all = globalUnion.filter((s) => s.cat === cat);
    if (!all.length) continue;
    const hits = q ? all.filter((s) => s.name.includes(q)) : all;
    if (q && !hits.length) continue; // 搜尋時隱藏無命中群組
    const open = q ? true : expandedCats.has(cat); // 搜尋時自動展開命中群組
    const checkedN = all.filter((s) => s.checked).length;
    html += `<div class="sgroup"><div class="sghead" data-cat="${cat}">` +
      `<input type="checkbox" class="gchk" data-cat="${cat}"${checkedN === all.length ? ' checked' : ''}` +
      ` aria-label="${cat} 全選">` +
      `<span class="caret${open ? ' open' : ''}">▶</span>` +
      `<span class="gname">${cat}</span><span class="gcnt">${checkedN}/${all.length}</span></div>` +
      (open ? `<div class="sgbody">${hits.map((s) => srcRowHtml(s, `data-no-chk="${s.no}"`)).join('')}</div>` : '') +
      '</div>';
  }
  const list = $('#srcList');
  list.innerHTML = html;
  list.querySelectorAll<HTMLInputElement>('.gchk').forEach((g) => {
    const cat = g.getAttribute('data-cat')!;
    const all = globalUnion.filter((s) => s.cat === cat);
    const n = all.filter((s) => s.checked).length;
    g.indeterminate = n > 0 && n < all.length; // 半選需以 property 設定
    g.addEventListener('change', () => {
      all.forEach((s) => setUnionChecked(s, g.checked));
      renderUnionSources();
    });
  });
  list.querySelectorAll<HTMLElement>('.sghead').forEach((h) => {
    h.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('gchk')) return;
      const cat = h.getAttribute('data-cat')!;
      if (expandedCats.has(cat)) expandedCats.delete(cat); else expandedCats.add(cat);
      renderUnionSources();
    });
  });
  list.querySelectorAll<HTMLInputElement>('.schk').forEach((chk) => {
    const no = chk.getAttribute('data-no-chk');
    if (no === null) return;
    chk.addEventListener('change', () => {
      const s = globalUnion.find((x) => x.no === Number(no));
      if (!s) return;
      setUnionChecked(s, chk.checked);
      renderUnionSources();
    });
  });
  const se = list.querySelector<HTMLInputElement>('#ssearch')!;
  se.addEventListener('input', () => {
    srcQuery = se.value;
    renderUnionSources();
    const el = list.querySelector<HTMLInputElement>('#ssearch')!; // 重繪後還原焦點與游標
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

/* ── 引用連動（hover 高亮 + 點擊捲動；global 收合群組擴充見下方） ── */
function bindCites(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.cite').forEach((c) => {
    if ((c as HTMLElement & { _bound?: boolean })._bound) return;
    (c as HTMLElement & { _bound?: boolean })._bound = true;
    const no = c.getAttribute('data-src');
    const row = () => $('#srcList').querySelector<HTMLElement>(`.srcrow[data-no="${no}"]`);
    const ghead = () => {
      const s = globalUnion.find((x) => x.no === Number(no));
      return s ? $('#srcList').querySelector<HTMLElement>(`.sghead[data-cat="${s.cat}"]`) : null;
    };
    c.addEventListener('mouseenter', () => {
      const r = row();
      if (r) { r.classList.add('hl'); return; }
      if (curId === 'global') ghead()?.classList.add('hl'); // 收合中 → 高亮群組標頭
    });
    c.addEventListener('mouseleave', () => {
      row()?.classList.remove('hl');
      if (curId === 'global') ghead()?.classList.remove('hl');
    });
    c.addEventListener('click', () => {
      let r = row();
      if (!r && curId === 'global') {
        const s = globalUnion.find((x) => x.no === Number(no));
        if (!s) return;
        expandedCats.add(s.cat); // 自動展開目標群組
        srcQuery = '';
        renderUnionSources();
        r = row();
      }
      if (!r) return;
      r.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      r.classList.add('hl');
      setTimeout(() => r!.classList.remove('hl'), 2000);
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
  return curId === 'global' ? globalQa : (briefById(curId)?.qa ?? []);
}
function sendFree(): void {
  const input = $('#qinput') as HTMLInputElement;
  const t = input.value.trim();
  if (!t || answering || generating) return;
  input.value = '';
  // 綜合對話 或 live 晨報，且有 live provider → 打真後端 rag-agent；其餘維持預錄示範說明
  if ((curId === 'global' || isLiveBrief(curId)) && typeof sCtx.data.policy.chat === 'function') {
    void askLive(t);
    return;
  }
  ask({
    q: t,
    a: '此為示範環境，自由輸入的問題將由正式版 LLM + RAG 依 iMarine 五類資料庫即時回答並附引用；您可先點選下方建議追問體驗完整流程。',
  }, null);
}

/* 回答/報告的引用連到「常駐的知識庫清單」而非只留本次用到的來源：
   把答案內以「本次證據編號」標的 cite 重映射成右欄知識庫列的編號（依 sourceId 對應），
   並回傳有被引用到的知識庫列編號集合，供標記。來源不因未引用而消失。 */
function kbCiteMap(answerSources: PolicySource[]): { map: Map<number, number>; used: Set<number> } {
  const map = new Map<number, number>();
  const used = new Set<number>();
  for (const s of answerSources) {
    const kb = s.sourceId ? globalUnion.find((g) => g.sourceId === s.sourceId) : undefined;
    if (kb) { map.set(s.no, kb.no); used.add(kb.no); }
  }
  return { map, used };
}
function remapCites(html: string, map: Map<number, number>): string {
  return html.replace(/data-src="(\d+)"/g, (m, n) => {
    const kb = map.get(Number(n));
    return kb ? `data-src="${kb}"` : m;
  });
}
function markUsedKb(used: Set<number>): void {
  $('#srcList').querySelectorAll<HTMLElement>('.srcrow').forEach((r) => {
    r.classList.toggle('used', used.has(Number(r.getAttribute('data-no'))));
  });
}

/* live 晨報提問：把答案的證據來源渲染到右欄（cite 已由 provider 以 1..k 編號，直接對齊 data-no）。 */
function renderLiveAnswerSources(sources: PolicySource[]): void {
  $('#srcCount').textContent = String(sources.length);
  $('#srcList').innerHTML = sources.map((s) => srcRowHtml(s, `data-no-live="${s.no}"`)).join('');
}

/* 綜合對話 live 提問：沿用思考氣泡動畫，await 真後端回答後渲染引用；失敗則明確告知並不影響 demo */
async function askLive(question: string): Promise<void> {
  if (answering || generating) return;
  const chat = sCtx.data.policy.chat;
  if (!chat) return;
  const model = MODEL[llm];
  const askCurId = curId;               // 記住提問當下的情報卡（回應期間被切走則放棄）
  const global = askCurId === 'global';
  answering = true;

  const thread = $('#thread');
  const uq = document.createElement('div');
  uq.className = 'msg user';
  uq.textContent = question; // 使用者輸入一律 textContent（XSS 安全）
  thread.appendChild(uq);

  const think = document.createElement('div');
  think.className = 'msg ai thinking';
  think.innerHTML = '<i class="sdot"></i><span>檢索 iMarine 資料庫…</span>';
  thread.appendChild(think);
  scrollThread();

  try {
    const res = await chat(question, global ? globalHistory.slice(-8) : []);
    if (curId !== askCurId) { answering = false; return; } // 回應期間被切走 → 不污染其他情報
    let answerHtml = res.answerHtml;
    let usedCount = res.sources.length;
    if (global) {
      globalHistory.push({ role: 'user', content: question });
      globalHistory.push({ role: 'assistant', content: res.answerText });
      // 引用重映射到常駐知識庫清單，並標記本次用到的來源（清單保持完整、不消失）
      const { map, used } = kbCiteMap(res.sources);
      answerHtml = remapCites(res.answerHtml, map);
      markUsedKb(used);
      usedCount = used.size;
    } else {
      // live 晨報：把答案證據當右欄來源（cite 已對齊 1..k），取代該卡原本的新聞來源清單
      renderLiveAnswerSources(res.sources);
    }
    think.remove();
    const am = document.createElement('div');
    am.className = 'msg ai';
    // 照實顯示後端實際使用的模型（如「gemma3n:e4b」）；缺值時退回接口名
    const modelLabel = res.model || model;
    am.innerHTML = `<p>${answerHtml}</p><div class="mfoot">${modelLabel} · ${nowStr()} · live`
      + (usedCount ? ` · 引用 ${usedCount} 筆` : '') + '</div>';
    thread.appendChild(am);
    bindCites(am);
    scrollThread();
    renderGbar(res.grounding, `live · ${usedCount} 筆來源引用`);
  } catch {
    think.remove();
    const am = document.createElement('div');
    am.className = 'msg ai';
    am.innerHTML = '<p>後端連線失敗，暫時無法即時回答。請確認 rag-agent 已於 VITE_POLICY_API 指定位址啟動'
      + `（預設 :8100）。</p><div class="mfoot">${model} · ${nowStr()}</div>`;
    thread.appendChild(am);
    scrollThread();
  } finally {
    answering = false;
  }
}

/* ── 產報告（綜合對話模式）：右欄勾選的來源 + 需求 + 模版 → /api/report → 報告卡 ── */
async function generateReport(): Promise<void> {
  if (answering || generating || curId !== 'global') return;
  const doReport = sCtx.data.policy.report;
  if (!doReport) return;
  const input = $('#qinput') as HTMLInputElement;
  const prompt = input.value.trim();
  if (!prompt) { input.focus(); return; }
  const sourceIds = globalUnion.filter((s) => s.checked && s.sourceId).map((s) => s.sourceId!);
  const tmplId = ($('#tmplSel') as HTMLSelectElement).value || 'policy_brief';
  input.value = '';
  generating = true;
  const btn = $('#reportBtn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = '生成中…';

  const thread = $('#thread');
  const uq = document.createElement('div');
  uq.className = 'msg user';
  uq.textContent = `產報告：${prompt}`;
  thread.appendChild(uq);
  const think = document.createElement('div');
  think.className = 'msg ai thinking';
  think.innerHTML = '<i class="sdot"></i><span>檢索來源、撰寫報告中…</span>';
  thread.appendChild(think);
  scrollThread();

  try {
    const res = await doReport(prompt, sourceIds, tmplId);
    if (curId !== 'global') return;                 // 生成期間被切走則放棄渲染
    // 引用重映射到常駐知識庫清單並標記，來源清單保持完整
    const { map, used } = kbCiteMap(res.sources);
    markUsedKb(used);
    think.remove();
    renderReportCard({
      ...res,
      sections: res.sections.map((s) => ({ ...s, html: remapCites(s.html, map) })),
    });
    renderGbar(res.grounding, `report · ${used.size} 筆來源引用`);
  } catch {
    think.remove();
    const am = document.createElement('div');
    am.className = 'msg ai';
    am.innerHTML = '<p>報告生成失敗，請確認 rag-agent 已於 VITE_POLICY_API 指定位址啟動（預設 :8100）。</p>'
      + `<div class="mfoot">${MODEL[llm]} · ${nowStr()}</div>`;
    thread.appendChild(am);
  } finally {
    generating = false;
    btn.disabled = false;
    btn.textContent = '產生報告';
    scrollThread();
  }
}

/* ── 報告匯出：Markdown 下載 + 列印/存 PDF ── */
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* 章節 html → 純文字：cite span 還原成 [n]、<br> 換行、去標籤、解 entity。 */
function htmlToText(html: string): string {
  const s = html
    .replace(/<span class="cite"[^>]*>(\d+)<\/span>/g, '[$1]')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
}
function reportToMarkdown(res: PolicyReportResult): string {
  const lines = [
    `# 政策報告：${res.topic}`, '',
    `> 產出：${res.model || res.provider || ''} · Grounding ${res.grounding}% · ${new Date().toLocaleString('zh-TW')}`,
    '',
  ];
  for (const s of res.sections) {
    lines.push(`## ${s.label}`, '', htmlToText(s.html).trim(), '');
  }
  lines.push('## 參考來源', '');
  for (const src of res.sources) {
    lines.push(`- [${src.no}] ${src.name}${src.date ? '（' + src.date + '）' : ''}`);
  }
  return lines.join('\n');
}
function safeName(s: string): string {
  return (s.replace(/[\\/:*?"<>|]/g, '').slice(0, 40).trim()) || '政策報告';
}
function downloadReport(res: PolicyReportResult): void {
  const blob = new Blob([reportToMarkdown(res)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `政策報告-${safeName(res.topic)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
/* 用隱藏 iframe 載入報告 → 瀏覽器列印 → 使用者可另存 PDF（不被彈窗封鎖、零依賴）。 */
function printReport(res: PolicyReportResult): void {
  const body = res.sections.map((s) => `<h2>${escHtml(s.label)}</h2><div>${s.html}</div>`).join('');
  const srcs = res.sources.map((s) => `<li>[${s.no}] ${escHtml(s.name)}</li>`).join('');
  const html =
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">` +
    `<title>政策報告：${escHtml(res.topic)}</title><style>` +
    `body{font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 20px;line-height:1.75;color:#111}` +
    `h1{font-size:22px} h2{font-size:16px;margin-top:22px;border-bottom:1px solid #ddd;padding-bottom:4px}` +
    `.cite{font-size:11px;vertical-align:super;color:#2563eb;margin:0 2px}` +
    `.foot{color:#666;font-size:12px;margin-bottom:18px} ol,ul{padding-left:20px}` +
    `</style></head><body>` +
    `<h1>政策報告：${escHtml(res.topic)}</h1>` +
    `<div class="foot">產出：${escHtml(res.model || res.provider || '')} · Grounding ${res.grounding}% · ${new Date().toLocaleString('zh-TW')}</div>` +
    `${body}<h2>參考來源</h2><ol>${srcs}</ol></body></html>`;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  // srcdoc 的 onload 一定會觸發（不像 document.write），確保內容載入完成才列印
  iframe.srcdoc = html;
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) { iframe.remove(); return; }
    try { win.focus(); win.print(); } catch { /* noop */ }
    setTimeout(() => iframe.remove(), 1500);
  };
  document.body.appendChild(iframe);
}

function renderReportCard(res: PolicyReportResult): void {
  const thread = $('#thread');
  const card = document.createElement('div');
  card.className = 'msg ai reportcard';
  const secHtml = res.sections.map((s) => `<h3>${s.label}</h3><p>${s.html}</p>`).join('');
  const citeCount = new Set(
    Array.from(secHtml.matchAll(/data-src="(\d+)"/g)).map((m) => m[1]),
  ).size;
  card.innerHTML =
    `<div class="mhead"><i></i>結構化產出 · ${res.topic}</div>` +
    `<div id="reportBody">${secHtml}</div>` +
    '<div class="rptexports" style="display:flex;gap:8px;margin-top:12px">' +
    '<button class="qchip" data-exp="md">下載 Markdown</button>' +
    '<button class="qchip" data-exp="pdf">列印 / 存 PDF</button></div>' +
    `<div class="mfoot">${res.model || res.provider} · ${nowStr()} · report`
    + (citeCount ? ` · 引用 ${citeCount} 筆` : '') + '</div>';
  thread.appendChild(card);
  card.querySelector('[data-exp="md"]')?.addEventListener('click', () => downloadReport(res));
  card.querySelector('[data-exp="pdf"]')?.addEventListener('click', () => printReport(res));
  bindCites(card);
  scrollThread();
}

const STEPMS = { local: [800, 1300, 2400, 1000], cloud: [500, 800, 1500, 700] } as const;

/* ── 重新生成：四步驟動畫在產出卡內原位播放，完成後段落 stagger 進場 ── */
function stepHtml(texts: string[], stage: number): string {
  return '<div id="steps">' + texts.map((t, i) => {
    const cls = i < stage ? 'done' : i === stage ? 'run' : '';
    return `<div class="step ${cls}"><i class="sdot"></i><span>${t}</span></div>`;
  }).join('') + '</div>';
}
function regenerate(): void {
  if (generating || answering || curId === 'global') return;
  const b = briefById(curId);
  if (!b) return;
  const model = MODEL[llm]; // 捕捉觸發當下的接口
  const checked = b.sources.filter((s) => s.checked);
  const body = () => sectionEl.querySelector<HTMLElement>('#reportBody');
  const genBtn = $('#genBtn') as HTMLButtonElement;

  const finish = () => {
    generating = false;
    activeTimeline = null;
    genBtn.textContent = '重新生成';
    const el = body();
    if (!el) return;
    el.innerHTML = bodyHtml(b);
    if (!reduced()) {
      Array.from(el.children).forEach((kid, i) => {
        kid.classList.add('genin');
        (kid as HTMLElement).style.setProperty('--gd', `${(i * 0.09).toFixed(2)}s`);
      });
    }
    bindCites($('#thread'));
    $('#thread').querySelector<HTMLButtonElement>('.wlink')?.addEventListener('click', function () {
      select(this.getAttribute('data-goto')!);
    });
    sCtx.ui.toast({
      title: '報告已生成',
      message: `${b.groundingNote} · Grounding ${b.grounding}%（${model}）`,
      duration: 3600,
    });
  };

  if (reduced()) { finish(); return; } // reduced-motion：直通結果

  generating = true;
  genBtn.textContent = '生成中…';
  const texts = [
    `解讀議題：${b.title}`,
    `檢索 iMarine 資料庫 · 命中 ${b.retrieved} 筆`,
    `閱讀來源（0/${checked.length}）`,
    '綜合草稿與 Grounding 驗證',
  ];
  const ms = STEPMS[llm];
  const redraw = (stage: number) => { const el = body(); if (el) el.innerHTML = stepHtml(texts, stage); };
  redraw(0);

  const events: { at: number; run: () => void }[] = [];
  let t = ms[0];
  events.push({ at: t, run: () => redraw(1) });
  t += ms[1];
  events.push({ at: t, run: () => redraw(2) });
  const per = ms[2] / Math.max(checked.length, 1);
  checked.forEach((src, i) => {
    events.push({ at: t + per * i, run: () => { texts[2] = `閱讀來源：${src.name}（${i + 1}/${checked.length}）`; redraw(2); } });
  });
  t += ms[2];
  events.push({ at: t, run: () => { texts[2] = `閱讀來源 ${checked.length} 筆完成`; redraw(3); } });
  t += ms[3];
  activeTimeline = runTimeline(events, t, finish);
}

/* ── 條目切換 ── */
function select(id: string): void {
  cancelTimers(); // 切條目取消進行中的回答/生成
  if (id === 'global') {
    curId = 'global';
    globalHistory = []; // 重新進入知識庫模式 → 對話歷史歸零
    renderInbox();
    $('#rTitle').textContent = '綜合對話 — 跨知識庫';
    ($('#genBtn') as HTMLElement).style.display = 'none'; // 知識庫模式無單一報告可重生成
    // 綜合對話模式才顯示「產報告」列（需 live provider）
    ($('#genrow') as HTMLElement).style.display =
      typeof sCtx.data.policy.report === 'function' ? 'flex' : 'none';
    $('#thread').innerHTML =
      `<div class="msg ai reportcard"><div class="mhead"><i></i>知識庫總覽</div>` +
      `<p style="margin:0;color:var(--ink-60);font-size:13.5px">載入知識庫清單…</p></div>`;
    renderChips(globalQa, 'global');
    ($('#qinput') as HTMLInputElement).value = '';
    $('#srcCount').textContent = '…';
    $('#srcList').innerHTML = '';
    void loadGlobalSources(); // 真實知識庫（後端不在則退回 mock）
    return;
  }
  const b = briefById(id);
  if (!b) return;
  curId = id;
  st(id).unread = false;
  ($('#genBtn') as HTMLElement).style.display = '';
  ($('#genrow') as HTMLElement).style.display = 'none'; // 單條情報不提供產報告
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
          '<button class="lbtn' + (llm === 'local' ? ' on' : '') + '" data-llm="local">地端部署</button>' +
          '<button class="lbtn' + (llm === 'cloud' ? ' on' : '') + '" data-llm="cloud">雲端 API</button></nav>',
      }) +
      template +
      '</div>';

    // LLM 切換：真的切換後端生成模型（與設定頁同一 applyLlmMode 邏輯）
    el.querySelectorAll<HTMLButtonElement>('.lbtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('on')) return;
        const prev = llm;
        const v = btn.getAttribute('data-llm') as keyof typeof MODEL;
        el.querySelectorAll('.lbtn').forEach((x) => x.classList.toggle('on', x === btn)); // 樂觀切換
        const res = await applyLlmMode(v);
        if (res.ok) {
          llm = v;
          setSetting('policy.llmMode', v);
          ctx.ui.toast({ title: '已切換 LLM 接口', message: res.message, duration: 3000 });
        } else {
          el.querySelectorAll('.lbtn').forEach((x) =>
            x.classList.toggle('on', x.getAttribute('data-llm') === prev)); // 還原，後端維持原設定
          ctx.ui.toast({ title: '無法切換接口', message: res.message, duration: 3400 });
        }
      });
    });

    // 設定頁改 llmMode → 本頁 segmented 跟隨（切換 handler 內 setSetting 會回射自己，值比對免震盪）
    subscribe('policy.llmMode', (v) => {
      if (v !== 'local' && v !== 'cloud') return;
      if (v === llm) return;
      llm = v;
      el.querySelectorAll('.lbtn').forEach((x) =>
        x.classList.toggle('on', x.getAttribute('data-llm') === llm));
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
      const pair = currentQa()[qi];
      if (isLiveBrief(curId)) {                 // live 晨報：chip 走真後端，非預錄劇本
        if (answering || generating) return;
        st(curId).used.add(qi);
        renderChips(currentQa(), curId);
        void askLive(pair.q);
        return;
      }
      // 綜合對話送出當下解析 {{c:名稱}}，編號永遠正確
      ask(curId === 'global' ? { q: pair.q, a: resolveTokens(pair.a) } : pair, qi);
    });
    $('#qsend').addEventListener('click', sendFree);
    ($('#qinput') as HTMLInputElement).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendFree();
    });

    $('#genBtn').addEventListener('click', regenerate);
    $('#simBtn').addEventListener('click', flowIn);
    $('#newsBtn').addEventListener('click', refreshNews);

    // 產報告：載入模版清單 + 綁定按鈕（後端不在則清單留空，產報告會 fallback 告知）
    $('#reportBtn').addEventListener('click', generateReport);
    const polProvider = ctx.data.policy;
    if (polProvider.reportTemplates) {
      polProvider.reportTemplates().then((tmpls) => {
        const sel = sectionEl.querySelector<HTMLSelectElement>('#tmplSel');
        if (sel) {
          sel.innerHTML = tmpls
            .map((t) => `<option value="${t.id}" title="${t.description}">${t.label}</option>`)
            .join('');
        }
      }).catch(() => { /* 後端不在，維持空白 */ });
    }

    select('global');   // 進頁預設鎖定「綜合對話 · 全部來源」
  },
  show() {
    // 從設定頁（新增/上傳知識庫）返回時刷新右欄來源，帶進新建的知識庫
    if (curId === 'global' && !answering && !generating) void loadGlobalSources();
    if (autoFlowArmed) return;
    autoFlowArmed = true;
    setTimeout(() => {
      if (flowIdx === 0 && sectionEl.classList.contains('active')) flowIn();
    }, 9000);
  },
  hide() {
    const wasAnimating = generating || answering;
    cancelTimers();
    if (!wasAnimating) return;
    // 動畫中被切走：還原乾淨狀態，避免返回時看到凍結的步驟區/殘留思考氣泡
    sectionEl.querySelector('#thread .msg.thinking')?.remove();
    const b = briefById(curId);
    const body = sectionEl.querySelector<HTMLElement>('#reportBody');
    if (b && body) {
      body.innerHTML = bodyHtml(b);
      bindCites($('#thread'));
      $('#thread').querySelector<HTMLButtonElement>('.wlink')?.addEventListener('click', function () {
        select(this.getAttribute('data-goto')!);
      });
    }
  },
};
export default s;

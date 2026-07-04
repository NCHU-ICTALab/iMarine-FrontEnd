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
  if (curId !== 'global') return;
  buildUnion(); // 對話串不重置，只同步右欄與 gbar
  renderGbar(avgGrounding(), `跨 ${briefs.length} 條情報平均 · ${globalUnion.length} 筆來源就緒`);
  renderUnionSources();
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
const CATS = ['海運焦點新聞', '全球航運指數', '台灣數據統計', '航港法令', '替代能源專區'];
let globalUnion: PolicySource[] = [];
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
  ask({
    q: t,
    a: '此為示範環境，自由輸入的問題將由正式版 LLM + RAG 依 iMarine 五類資料庫即時回答並附引用；您可先點選下方建議追問體驗完整流程。',
  }, null);
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
    renderInbox();
    $('#rTitle').textContent = '綜合對話 — 跨情報知識庫';
    ($('#genBtn') as HTMLElement).style.display = 'none'; // 知識庫模式無單一報告可重生成
    buildUnion();
    $('#thread').innerHTML =
      `<div class="msg ai reportcard"><div class="mhead"><i></i>知識庫總覽</div>` +
      `<p style="margin:0;color:var(--ink-60);font-size:13.5px">已就緒 ${briefs.length} 條情報、` +
      `${globalUnion.length} 筆來源文件（${catCounts()}）。可勾選右欄來源後直接提問，回答皆附引用；` +
      '也可點下方建議提問開始。</p></div>';
    renderChips(globalQa, 'global');
    ($('#qinput') as HTMLInputElement).value = '';
    renderGbar(avgGrounding(), `跨 ${briefs.length} 條情報平均 · ${globalUnion.length} 筆來源就緒`);
    renderUnionSources();
    return;
  }
  const b = briefById(id);
  if (!b) return;
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
      let pair = currentQa()[qi];
      if (curId === 'global') pair = { q: pair.q, a: resolveTokens(pair.a) }; // 送出當下解析，編號永遠正確
      ask(pair, qi);
    });
    $('#qsend').addEventListener('click', sendFree);
    ($('#qinput') as HTMLInputElement).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendFree();
    });

    $('#genBtn').addEventListener('click', regenerate);
    $('#simBtn').addEventListener('click', flowIn);

    select(briefs[0].id);
  },
  show() {
    if (autoFlowArmed) return;
    autoFlowArmed = true;
    setTimeout(() => {
      if (flowIdx === 0 && sectionEl.classList.contains('active')) flowIn();
    }, 9000);
  },
  hide() { cancelTimers(); },
};
export default s;

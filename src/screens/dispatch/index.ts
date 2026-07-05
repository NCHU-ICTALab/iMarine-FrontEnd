/* Dispatch screen — 短時微氣候 · 即時派工建議（2026-07-05 spec 改版）。
   互動基準：docs/preview/preview-dispatch-redesign.html。
   本檔為膠合層：一切內容從當前情境（cur）重渲染；結論標記解析走 ./conclusion。 */
import type { Screen, ScreenCtx } from '../types';
import type { DispatchScenario, DispatchCard, OpRow, OpStatus, RainLevel } from '../../data/types';
import { screenHeader } from '../../ui/components';
import { parseConclusion } from './conclusion';
import template from './dispatch.html?raw';
import './dispatch.css';

type ScenarioId = DispatchScenario['id'];

let scenarios: DispatchScenario[] = [];
let cur: ScenarioId = 'stable';
let sectionEl: HTMLElement;
let sCtx: ScreenCtx;

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
  sectionEl.querySelector(sel) as T;
const scn = (): DispatchScenario => scenarios.find((s) => s.id === cur)!;

let openOp: string | null = null;              // 展開中的作業列
let timers: ReturnType<typeof setTimeout>[] = []; // 進行中的動畫（切情境取消）
let bubbleRefresh: (() => void) | null = null; // Task 5 指定
function later(fn: () => void, ms: number): void { timers.push(setTimeout(fn, ms)); }
function cancelTimers(): void { timers.forEach(clearTimeout); timers = []; }
let stopInference: () => void = () => {};      // Task 6 覆寫

/* 六級雨量分級 → hero 風險色三態（spec §3：大字塊底色 = 當前風險色） */
const WXCLS: Record<RainLevel, 'ok' | 'warn' | 'stop'> =
  { 無: 'ok', 小雨: 'ok', 大雨: 'warn', 豪雨: 'stop', 大豪雨: 'stop', 超大豪雨: 'stop' };
const SYM: Record<OpStatus, string> = { stop: '✕ ', warn: '! ', ok: '' };

function renderHero(sc: DispatchScenario): void {
  const n = sc.nowcast;
  const wx = $('#wx');
  wx.classList.remove('ok', 'warn', 'stop');
  wx.classList.add(WXCLS[n.rainLevel]);
  $('#wxlvl').textContent = n.rainLevel === '無' ? '無降雨' : n.rainLevel;
  $('#wxbf').textContent = `${n.beaufort} 級`;
  $('#wxavg').textContent = n.windAvg.toFixed(1);
  $('#wxgust').textContent = n.windGust.toFixed(1);
  $('#wxmet').textContent =
    `CSI ${sc.metrics.csi.toFixed(2)} · POD ${sc.metrics.pod.toFixed(2)} · FAR ${sc.metrics.far.toFixed(2)}`;
  $('#concl').innerHTML = parseConclusion(sc.conclusion);
}

function rowHtml(op: OpRow): string {
  return (
    `<div class="mrow" data-op="${op.id}" tabindex="0" role="button" aria-expanded="false">` +
    `<span class="chev">▶</span><span class="nm">${op.name}</span>` +
    `<span class="mseg now st-${op.now.status}">${SYM[op.now.status]}${op.now.action}</span>` +
    `<span class="mseg cwa st-${op.cwa3}"></span>` +
    `<span class="mseg cwa st-${op.cwa6}"></span></div>`
  );
}

function renderMatrix(sc: DispatchScenario): void {
  $('#mxbody').innerHTML = sc.ops.map(rowHtml).join('');
  openOp = null;
}

function tagHtml(tag: 'official' | 'industry'): string {
  return `<span class="tag ${tag === 'official' ? 'o' : 'i'}">${tag === 'official' ? '官方' : '慣例'}</span>`;
}
function toggleRow(row: HTMLElement): void {
  const id = row.getAttribute('data-op')!;
  sectionEl.querySelector('#mxbody .mexp')?.remove();
  const prev = sectionEl.querySelector('#mxbody .mrow.open');
  if (prev) { prev.classList.remove('open'); prev.setAttribute('aria-expanded', 'false'); }
  if (openOp === id) { openOp = null; return; }   // 再點同列 = 收合
  openOp = id;
  row.classList.add('open');
  row.setAttribute('aria-expanded', 'true');
  const op = scn().ops.find((o) => o.id === id)!;
  const exp = document.createElement('div');
  exp.className = 'mexp';
  exp.innerHTML = op.rules.map((r, i) =>
    i === 0
      ? `<div>${r.text}</div><div class="r">${tagHtml(r.tag)}${r.basis}</div>`
      : `<div class="r">${tagHtml(r.tag)}${r.text} — ${r.basis}</div>`,
  ).join('');
  row.after(exp);
}

function cardHtml(c: DispatchCard, i: number): string {
  const b = c.badge
    ? `<span class="dbadge ${c.badge.urgent ? 'u' : 'n'}">${c.badge.text}</span>` : '';
  return (
    `<div class="dcard lg lg-static ${c.level} anim" style="--d:${(0.05 * i).toFixed(2)}s">` +
    `<b>${c.title}${b}</b><p>${c.body}</p></div>`
  );
}

function renderCards(sc: DispatchScenario): void {
  $('#cardn').textContent = String(sc.cards.length);
  $('#cards').innerHTML = sc.cards.map(cardHtml).join('');
}

function renderAll(): void {
  const sc = scn();
  renderHero(sc);
  renderMatrix(sc);
  renderCards(sc);
}

function segctlHtml(): string {
  return (
    '<div class="segctl lg" data-lg id="segctl"><span class="cap">模擬情境</span>' +
    scenarios.map((s) =>
      `<button class="scbtn${s.id === cur ? ' on' : ''}" data-scn="${s.id}">${s.label}</button>`,
    ).join('') +
    '</div>'
  );
}

const TOAST: Record<ScenarioId, string> = {
  stable: '全作業線正常',
  rain: '3 項作業停工、1 項加派',
  typhoon: '全港停止作業預備',
};

const s: Screen = {
  async mount(el, ctx) {
    sectionEl = el;
    sCtx = ctx;
    scenarios = (await ctx.data.dispatch.snapshot()).scenarios;
    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '港邊人員視角 · MODULE 04',
        color: '#F5A54A',
        title: '短時微氣候 · 即時派工建議',
        badges: ['ConvLSTM 0-90 min'],
        source: 'mock',
        actionsHtml: segctlHtml(),
      }) +
      template +
      '</div>';
    renderAll();
    $('#mxbody').addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.mrow');
      if (row) toggleRow(row);
    });
    $('#mxbody').addEventListener('keydown', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.mrow');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleRow(row); }
    });
    $('#segctl').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.scbtn');
      if (!btn || btn.classList.contains('on')) return;
      cancelTimers();          // 取消進行中的推論動畫（Task 6），不洩漏舊情境內容
      stopInference();
      cur = btn.getAttribute('data-scn') as ScenarioId;
      sectionEl.querySelectorAll('.scbtn').forEach((b) => b.classList.toggle('on', b === btn));
      renderAll();
      (bubbleRefresh as (() => void) | null)?.();       // Task 5：泡泡文字跟上新情境
      sCtx.ui.toast({ title: `已切換情境：${scn().label}`, message: TOAST[cur] });
    });
  },
};
export default s;

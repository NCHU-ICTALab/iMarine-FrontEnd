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
  },
};
export default s;

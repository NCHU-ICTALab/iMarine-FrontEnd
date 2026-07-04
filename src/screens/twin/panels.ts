/* 右 rail 面板：資料綁定與渲染。版面 markup 在 twin.html，本檔只填內容與掛事件。 */
import type { ScreenCtx } from '../types';
import { SHIP_CATEGORIES, SHIP_CATEGORY_COLORS, type ShipCategory } from './palette';
import { inPortAt, categoryCounts, fromMs, toMs, type TwinScene } from './scene-init';

const rgb = (i: number, a = 1) =>
  `rgba(${SHIP_CATEGORY_COLORS[i][0]},${SHIP_CATEGORY_COLORS[i][1]},${SHIP_CATEGORY_COLORS[i][2]},${a})`;

export interface PanelsApi {
  renderTrend(tMs: number): void;
  enabled: Set<ShipCategory>;
  onFilterChange(fn: () => void): void;
}

export function initPanels(el: HTMLElement, ctx: ScreenCtx, scene: TwinScene): PanelsApi {
  const enabled = new Set<ShipCategory>(SHIP_CATEGORIES);
  const filterListeners: Array<() => void> = [];

  // ── 船型篩選（勾選列＝圖例；計數為該類真實航跡數）──
  const counts = categoryCounts();
  const filters = el.querySelector<HTMLElement>('#railFilters')!;
  SHIP_CATEGORIES.forEach((name, i) => {
    const row = document.createElement('label');
    row.className = 'frow';
    row.innerHTML = `<input type="checkbox" checked><span class="cdot" style="background:${rgb(i)};box-shadow:0 0 6px ${rgb(i, 0.45)}"></span>${name}<span class="cnt">${counts[i]}</span>`;
    row.querySelector('input')!.addEventListener('change', (e) => {
      if ((e.target as HTMLInputElement).checked) enabled.add(name); else enabled.delete(name);
      scene.setFilter(new Set(enabled));
      filterListeners.forEach((fn) => fn());
    });
    filters.appendChild(row);
  });

  // ── 航跡密度圖層開關 ──
  el.querySelector<HTMLInputElement>('#densToggle')!.addEventListener('change', (e) => {
    scene.setDensity((e.target as HTMLInputElement).checked);
  });

  // ── 在港趨勢（單一序列：折線 + 面積 + 淡格線 + 回放游標；48 取樣點）──
  const trendSvg = el.querySelector<SVGElement>('#trend')!;
  const trNow = el.querySelector<HTMLElement>('#trNow')!;
  function renderTrend(tMs: number): void {
    const N = 48, w = 264, h = 110, pad = 6;
    const ys: number[] = [];
    for (let i = 0; i <= N; i++) ys.push(inPortAt(fromMs + ((toMs - fromMs) * i) / N, enabled));
    const ymax = Math.max(4, ...ys);
    const X = (i: number) => pad + ((w - 2 * pad) * i) / N;
    const Y = (v: number) => h - pad - ((h - 2 * pad - 14) * v) / ymax;
    let line = '', area = `M ${X(0)} ${h - pad}`;
    ys.forEach((v, i) => { const seg = `${X(i)} ${Y(v)}`; line += (i ? ' L ' : 'M ') + seg; area += ' L ' + seg; });
    area += ` L ${X(N)} ${h - pad} Z`;
    const k = (tMs - fromMs) / (toMs - fromMs);
    const cx = X(k * N), cy = Y(inPortAt(tMs, enabled));
    const grid = [0.25, 0.5, 0.75].map((g) =>
      `<line x1="${pad}" x2="${w - pad}" y1="${Y(ymax * g)}" y2="${Y(ymax * g)}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`).join('');
    trendSvg.innerHTML = `${grid}
      <path d="${area}" fill="rgba(127,180,255,.16)"/>
      <path d="${line}" fill="none" stroke="#7FB4FF" stroke-width="2" stroke-linejoin="round"/>
      <line x1="${cx}" x2="${cx}" y1="${pad}" y2="${h - pad}" stroke="rgba(53,224,166,.55)" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="3.5" fill="#35E0A6"/>
      <text x="${pad + 1}" y="${Y(ymax) - 3}" fill="rgba(170,184,200,.42)" font-size="9" font-family="ui-monospace,monospace">${ymax}</text>`;
    trNow.textContent = String(inPortAt(tMs, enabled));
  }

  void ctx; // Task 7 用 ctx.ui.toast
  return { renderTrend, enabled, onFilterChange: (fn) => filterListeners.push(fn) };
}

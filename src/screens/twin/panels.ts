/* 右 rail 面板：資料綁定與渲染。版面 markup 在 twin.html，本檔只填內容與掛事件。 */
import type { ScreenCtx } from '../types';
import { SHIP_CATEGORIES, SHIP_CATEGORY_COLORS, shipCategoryIndex, type ShipCategory } from './palette';
import { inPortAt, categoryCounts, occupancy, capturedAtMs, fromMs, toMs, type TwinScene } from './scene-init';
import type { TimelineApi } from './timeline';

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

// ── 未來推演面板（情境/甘特/KPI）。追加於 panels.ts；由 index.ts 在 initTimeline 之後呼叫。──
export function initFuturePanels(
  el: HTMLElement, ctx: ScreenCtx, panels: PanelsApi, timeline: TimelineApi,
): void {
  // 情境切換（mock 係數；文案沿用既有 toast）
  let scnFactor = 1, scnName = '基準情境';
  const kpiScn = el.querySelector<HTMLElement>('#kpiScn')!;
  el.querySelectorAll<HTMLButtonElement>('.scn').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.scn').forEach((x) => x.classList.toggle('on', x === btn));
      scnFactor = parseFloat(btn.dataset.f!); scnName = btn.textContent!;
      kpiScn.textContent = scnName;
      updateKpi();
      ctx.ui.toast({ title: '情境已套用', message: `「${scnName}」重新推演未來 24 小時` });
    });
  });

  // 泊位甘特：真實佔用區間（TWPort 快照），軸 = capturedAtMs 起 24 小時。
  // 窗範圍資料驅動：挑重疊區間數最大的連續 8 泊位（本快照實測為 63-70，15 筆；
  // 原 mockup 的 108-115 實查僅 108-110 有資料，寫死會有 5 條空軌，故改為動態）。
  const DAY = 24 * 3600_000;
  const live = occupancy.filter((it) => it.endMs > capturedAtMs && it.startMs < capturedAtMs + DAY);
  const byNo = new Map<number, number>();
  live.forEach((it) => byNo.set(it.berthNo, (byNo.get(it.berthNo) ?? 0) + 1));
  const allNos = [...byNo.keys()];
  let lo = Math.min(...allNos);
  {
    let bestC = -1;
    for (let s0 = Math.min(...allNos); s0 <= Math.max(...allNos) - 7; s0++) {
      let c = 0;
      for (let n = s0; n < s0 + 8; n++) c += byNo.get(n) ?? 0;
      if (c > bestC) { bestC = c; lo = s0; }
    }
  }
  el.querySelector<HTMLElement>('#gTag')!.textContent = `${lo}-${lo + 7}`;
  const gantt = el.querySelector<HTMLElement>('#gantt')!;
  const gnow = el.querySelector<HTMLElement>('#gnow')!;
  for (let no = lo; no < lo + 8; no++) {
    const bars = live
      .filter((it) => it.berthNo === no)
      .map((it) => {
        const a = Math.max(0, (it.startMs - capturedAtMs) / DAY);
        const b = Math.min(1, (it.endMs - capturedAtMs) / DAY);
        const ci = shipCategoryIndex(it.vessel.shipType);
        return `<div class="gbar" data-cat="${ci}" style="left:${a * 100}%;width:${(b - a) * 100}%;background:rgba(${SHIP_CATEGORY_COLORS[ci].join(',')},1)"></div>`;
      }).join('');
    const row = document.createElement('div');
    row.className = 'grow_';
    row.innerHTML = `<span>${no}</span><div class="gtrack">${bars}</div>`;
    gantt.appendChild(row);
  }
  function dimGantt(): void { // 被濾掉船種的 bar 淡化（不移除）
    gantt.querySelectorAll<HTMLElement>('.gbar').forEach((bar) => {
      const name = SHIP_CATEGORIES[+bar.dataset.cat!];
      bar.style.opacity = panels.enabled.has(name) ? '.85' : '.12';
    });
  }
  panels.onFilterChange(() => { dimGantt(); updateKpi(); });

  // KPI 在港船數（推演值 = 真實曲線基底 × 情境係數；彈簧數字）
  const kpiCount = el.querySelector<HTMLElement>('#kpiCount')!;
  const kpiT = el.querySelector<HTMLElement>('#kpiT')!;
  let shown = 0, target = 0, tick = 0;
  function updateKpi(): void {
    const win = toMs - fromMs;
    const baseMs = fromMs + (((timeline.frozenMs() - fromMs) + timeline.currentFutureMin() * 60_000) % win);
    target = Math.max(0, Math.round(inPortAt(baseMs, panels.enabled) * scnFactor));
    if (tick) return;
    const step = () => {
      shown += (target - shown) * 0.18;
      if (Math.abs(target - shown) < 0.05) { shown = target; kpiCount.textContent = String(target); tick = 0; return; }
      kpiCount.textContent = String(Math.round(shown));
      tick = requestAnimationFrame(step);
    };
    tick = requestAnimationFrame(step);
  }

  // 推演軸 scrub → 現在線 + KPI 時刻
  timeline.onScrub((m) => {
    if (m !== 'future') return;
    const f = timeline.currentFutureMin() / 1440;
    gnow.style.left = `calc(32px + ${f} * (100% - 32px))`; // 32px = 泊位編號欄寬
    const min = timeline.currentFutureMin();
    kpiT.textContent = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
    updateKpi();
  });

  updateKpi(); dimGantt();
}

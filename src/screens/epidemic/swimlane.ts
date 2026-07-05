/* Epi-Gantt 雙泳道 + 命中連接線 — 逐字轉錄 docs/preview/preview-epidemic-redesign.html 的
   dayX/renderSwimlane（該 preview 已 headless 驗證過行為）。
   時間軸標籤：型別 EpidemicSnapshot['timeRange'] 只帶 startDate/endDate（無 preview TR.labels
   陣列），故軸標籤取頭尾兩點（startDate / endDate+NOW），對應 dayToX(startDay)=0、
   dayToX(now)=w 兩端點；CSS `.axis{display:flex;justify-content:space-between}` 對任意則
   數的 label 皆成立。 */
import type { EpidemicVessel, EpidemicSnapshot } from '../../data/types';
import type { Hit } from './correlate';

export interface SwimlaneEls {
  berth: HTMLElement;
  evt: HTMLElement;
  hit: HTMLElement;
  axis: HTMLElement;
  sl: HTMLElement;
}

type TimeRange = EpidemicSnapshot['timeRange'];

const SRC: Record<'who' | 'cdc' | 'news', { name: string; c: string }> = {
  who: { name: 'WHO', c: '#F0648C' },
  cdc: { name: '疾管署', c: '#E9BC63' },
  news: { name: '新聞', c: '#6b7a8d' },
};

export function dayToX(day: number, w: number, timeRange: TimeRange): number {
  return ((day - timeRange.startDay) / (timeRange.now - timeRange.startDay)) * w;
}

export function renderSwimlane(
  els: SwimlaneEls,
  v: EpidemicVessel,
  hits: Hit[],
  timeRange: TimeRange,
): void {
  const w = els.sl.clientWidth - 62;

  els.berth.innerHTML = '';
  const hitPorts: Record<string, 'rose' | 'amber'> = {};
  hits.forEach((h) => {
    hitPorts[h.port] = h.type;
  });
  v.ports.forEach((p) => {
    const x = dayToX(p.dayIn, w, timeRange);
    const x2 = dayToX(p.dayOut, w, timeRange);
    const type = hitPorts[p.name];
    const col =
      type === 'rose' ? '#F0648C' : type === 'amber' ? '#F5A54A' : p.berthed ? '#35E0A6' : '#4a5568';
    const b = document.createElement('div');
    b.className = 'bar';
    b.style.cssText = `left:${x}px;width:${Math.max(x2 - x, 28)}px;background:${col};color:${type === 'rose' ? '#fff' : '#0a1018'}`;
    b.textContent = p.name;
    els.berth.appendChild(b);
  });

  els.evt.innerHTML = '';
  v.events.forEach((e) => {
    const x = dayToX(e.day, w, timeRange);
    const d = document.createElement('div');
    d.className = 'evt';
    const c = SRC[e.source].c;
    d.style.cssText = `left:${x}px;background:${c};box-shadow:0 0 8px ${c}`;
    d.title = `${SRC[e.source].name} ${e.label}`;
    els.evt.appendChild(d);
  });

  els.hit.innerHTML = '';
  hits.forEach((h) => {
    const x = dayToX(h.markerDay, w, timeRange);
    const line = document.createElement('div');
    line.className = 'hitline ' + h.type;
    line.style.cssText = `left:${x}px;top:6px;height:56px;width:${Math.min(1.5 + h.mag * 0.6, 5)}px`;
    els.hit.appendChild(line);
  });

  els.axis.innerHTML = `<span>${timeRange.startDate}</span><span>${timeRange.endDate} NOW</span>`;
}

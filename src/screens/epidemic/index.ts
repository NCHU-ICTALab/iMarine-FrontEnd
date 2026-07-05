/* Epidemic screen — 疫情自動追溯（2026-07-05 spec 改版）。
   互動基準：docs/preview/preview-epidemic-redesign.html。
   本檔為膠合層：規則式評分/時空交叉比對走 ./correlate、Mapbox 地圖走 ./worldmap、
   Epi-Gantt 泳道走 ./swimlane（皆單一真相來源，不在此重複定義）。Task 3 靜態骨架 +
   Task 4 地圖 + Task 5 泳道（select() 全連動：地圖/泳道/右欄同步、游標歸位 now）+
   Task 6 時間游標（拖曳/點擊/鍵盤，船沿真實航線插值 + 命中脈衝）已完成；
   細胞簡訊模擬偵測按鈕（Task 7）暫不綁定。 */
import type { Screen } from '../types';
import type {
  EpidemicSnapshot,
  EpidemicVessel,
  EpidemicPipelineStage,
  EpidemicEvent,
} from '../../data/types';
import { scoreVessel, computeHits, type RiskTier, type Hit } from './correlate';
import { createWorldMap, type WorldMap } from './worldmap';
import { renderSwimlane, dayToX, type SwimlaneEls } from './swimlane';
import { screenHeader } from '../../ui/components';
import template from './epidemic.html?raw';
import './epidemic.css';

/* runtime 擴充欄位：_unread（新船/升級流入未讀角標，Task 6/7 使用）、
   _state（管線階段燈號 wait/run/done，Task 7 的 playPipe() 動畫接手）。
   Snapshot 本身（EpidemicVessel/EpidemicPipelineStage）不帶這兩欄，只在模組內的複本上掛。 */
type FleetVessel = EpidemicVessel & { _unread?: boolean };
type PipeStage = EpidemicPipelineStage & { _state?: 'wait' | 'run' | 'done' };

let fleet: FleetVessel[] = [];
let pipe: PipeStage[] = [];
let curId: string | null = null;
let cursorDay = 0;
let timeRange: EpidemicSnapshot['timeRange'] = { startDate: '', endDate: '', startDay: 0, now: 0 };
let inflowPool: EpidemicSnapshot['inflowPool'] = [];
let sectionEl: HTMLElement;
let map: WorldMap;
let swimEls: SwimlaneEls;

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
  sectionEl.querySelector(sel) as T;

const current = (): FleetVessel => fleet.find((v) => v.id === curId)!;

const SRC: Record<EpidemicEvent['source'], { name: string; c: string }> = {
  who: { name: 'WHO', c: '#F0648C' },
  cdc: { name: '疾管署', c: '#E9BC63' },
  news: { name: '新聞', c: '#6b7a8d' },
};

const dotColor = (tier: RiskTier): string =>
  ({ red: '#F0648C', orange: '#F5A54A', yellow: '#E9BC63', green: '#3a4757' })[tier];

function sortedFleet(): FleetVessel[] {
  return [...fleet].sort((a, b) => scoreVessel(b.factors).score - scoreVessel(a.factors).score);
}

function meterRow(label: string, val: number, color: string): string {
  return (
    `<div class="rulerow"><span>${label}</span><span class="mono" style="color:${color}">${val}</span></div>` +
    `<div class="meter"><i style="width:${val}%;background:${color}"></i></div>`
  );
}

function renderRight(v: FleetVessel): void {
  const sc = scoreVessel(v.factors);
  const [tierName, tierSub] = sc.levelLabel.split(' · ');
  $('#epiScore').innerHTML =
    '<div style="display:flex;gap:12px;align-items:center">' +
    `<div class="ring" style="border-color:${sc.color};color:${sc.color};box-shadow:0 0 14px ${sc.color}55">${sc.score}</div>` +
    `<div><b style="color:${sc.color};font-size:14px">${tierName}</b>` +
    `<div style="font-size:11px;color:#8b9bad">${tierSub || ''}</div></div></div>` +
    `<div style="margin-top:11px">${meterRow('靠港天數', v.factors.dwellDays, '#E9BC63')}` +
    `${meterRow('來源強度', v.factors.sourceStrength, '#F0648C')}` +
    `${meterRow('距離因子', v.factors.distanceFactor, '#6b7a8d')}</div>`;
  $('#epiIntel').innerHTML = v.intel
    .map((x) => {
      const src = SRC[x.source];
      const border = x.hit ? `${src.c}88` : 'rgba(255,255,255,.12)';
      const color = x.hit ? src.c : '#6b7a8d';
      return `<div class="${x.hit ? '' : 'miss'}"><span class="chip" style="border-color:${border};color:${color}">${src.name}</span> ${x.text}</div>`;
    })
    .join('');
  $('#epiAdvice').innerHTML = v.advice.map((a) => `<span class="actchip">${a}</span>`).join('');
  $('#epiSms').innerHTML = `<div class="from">▲ IMARINE 疫情警報</div>${v.sms}`;
}

function renderKeyRow(v: FleetVessel): void {
  const hits = computeHits(v.ports, v.events);
  const top = hits[0];
  $('#epiKey').innerHTML =
    `<div class="kchip ${top ? (top.type === 'rose' ? 'red' : 'hi') : ''}">最高風險站點<b>${top ? top.port : '—'}</b></div>` +
    `<div class="kchip ${top ? 'hi' : ''}">時序${top ? (top.type === 'rose' ? '重疊' : '臨界') : ''}<b>${top ? (top.type === 'rose' ? '+' + top.mag + ' 天' : top.mag + ' 天') : '無'}</b></div>` +
    '<div class="kchip">現況<b>高雄港 在泊</b></div>' +
    `<div class="kchip">停靠序列<b>${v.ports.length} 港 / 14d</b></div>`;
}

function renderFleet(): void {
  const el = $('#epiFleet');
  el.innerHTML = '';
  sortedFleet().forEach((v) => {
    const sc = scoreVessel(v.factors);
    const row = document.createElement('div');
    row.className = 'frow' + (v.id === curId ? ' sel' : sc.tier === 'green' ? ' dim' : '');
    const hits = computeHits(v.ports, v.events);
    const origin = v.ports[0];
    const sub = hits.length
      ? `${hits[0].port} · ${hits[0].type === 'rose' ? '重疊 +' + hits[0].mag + 'd' : '臨界'}`
      : `${origin.name}來 · ${sc.tier === 'green' ? '正常' : '觀察'}`;
    row.innerHTML =
      `<span class="rdot" style="background:${dotColor(sc.tier)};box-shadow:0 0 9px ${sc.tier === 'green' ? 'transparent' : dotColor(sc.tier)}"></span>` +
      `<span class="fname">${v.name}<br><span class="fstop">${sub}</span></span>` +
      `<span class="fscore" style="color:${sc.tier === 'green' ? '#5f6d7f' : sc.color}">${sc.score}</span>` +
      (v._unread ? '<span class="unread"></span>' : '');
    row.addEventListener('click', () => {
      v._unread = false;
      select(v.id);
    });
    el.appendChild(row);
  });
}

function renderPipe(): void {
  const el = $('#epiPipe');
  el.innerHTML = '';
  pipe.forEach((stage, i) => {
    const st = stage._state ?? 'wait';
    const el2 = document.createElement('div');
    el2.className = 'pstage' + (st !== 'wait' ? ' on' : '');
    el2.innerHTML =
      `<span class="plamp ${st}"></span>${stage.label}` +
      (stage.count ? ` <span class="pcount ${stage.run ? 'hit' : ''}">${stage.count}</span>` : '');
    el.appendChild(el2);
    if (i < pipe.length - 1) {
      const f = document.createElement('div');
      f.className = 'pflow' + (pipe[i]._state === 'done' ? ' lit' : '');
      el.appendChild(f);
    }
  });
}

function positionCursor(): void {
  const w = swimEls.sl.clientWidth - 62;
  $('#epiCursor').style.left = `${62 + dayToX(cursorDay, w, timeRange)}px`;
}

function select(id: string): void {
  curId = id;
  cursorDay = timeRange.now;
  const v = current();
  renderFleet();
  const hits = computeHits(v.ports, v.events);
  if (map.ready) map.renderVessel(v, hits);
  renderSwimlane(swimEls, v, hits, timeRange);
  renderRight(v);
  renderKeyRow(v);
  positionCursor();
}

function cursorToDay(clientX: number): number {
  const r = swimEls.sl.getBoundingClientRect();
  const w = r.width - 62;
  let x = clientX - r.left - 62;
  x = Math.max(0, Math.min(w, x));
  return timeRange.startDay + (x / w) * (timeRange.now - timeRange.startDay);
}

function pulseHit(h: Hit): void {
  const w = swimEls.sl.clientWidth - 62;
  const p = document.createElement('div');
  p.className = 'hitpulse act';
  p.style.cssText = `left:${62 + dayToX(h.markerDay, w, timeRange)}px;top:22px;box-shadow:0 0 0 0 ${h.type === 'rose' ? '#F0648C' : '#F5A54A'}`;
  swimEls.sl.appendChild(p);
  setTimeout(() => p.remove(), 520);
}

function setCursor(day: number): void {
  const v = current();
  if (!v) return;
  const prev = cursorDay;
  cursorDay = Math.max(timeRange.startDay, Math.min(timeRange.now, day));
  map.setShipAt(v, cursorDay);
  positionCursor();
  computeHits(v.ports, v.events).forEach((h) => {
    if ((prev - h.markerDay) * (cursorDay - h.markerDay) <= 0 && Math.abs(cursorDay - h.markerDay) < 0.7) {
      pulseHit(h);
    }
  });
}

function bindCursor(): void {
  const cursorEl = $('#epiCursor');
  let dragging = false;
  const startDrag = (e: PointerEvent): void => {
    dragging = true;
    try {
      cursorEl.setPointerCapture(e.pointerId);
    } catch {
      /* 合成事件無 active pointer 會拋 NotFoundError，preview/dispatch 皆有此坑，吞掉即可 */
    }
  };
  window.addEventListener('pointermove', (e) => {
    if (dragging) setCursor(cursorToDay(e.clientX));
  });
  window.addEventListener('pointerup', (e) => {
    dragging = false;
    try {
      cursorEl.releasePointerCapture(e.pointerId);
    } catch {
      /* 同上 */
    }
  });
  cursorEl.addEventListener('pointerdown', startDrag);
  swimEls.sl.addEventListener('pointerdown', (e) => {
    if (e.target !== cursorEl) {
      setCursor(cursorToDay(e.clientX));
      startDrag(e);
    }
  });
  cursorEl.addEventListener('keydown', (e) => {
    const step = (timeRange.now - timeRange.startDay) / 26;
    if (e.key === 'ArrowLeft') {
      setCursor(cursorDay - step);
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'ArrowRight') {
      setCursor(cursorDay + step);
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Home') {
      setCursor(timeRange.startDay);
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'End') {
      setCursor(timeRange.now);
      e.preventDefault();
      e.stopPropagation();
    }
  });
}

const s: Screen = {
  async mount(el, ctx) {
    sectionEl = el;
    const snap: EpidemicSnapshot = await ctx.data.epidemic.snapshot();
    fleet = snap.fleet.map((v) => ({ ...v }));
    // 靜態管線狀態（比照 preview reduced-motion 終態：末站待推播、其餘依 run 旗標 done/run）；
    // 進場逐格點亮動畫留給 Task 7 的 playPipe()。
    pipe = snap.pipeline.map((stage, i) => ({
      ...stage,
      _state: i === snap.pipeline.length - 1 ? 'wait' : stage.run ? 'run' : 'done',
    }));
    timeRange = snap.timeRange;
    inflowPool = snap.inflowPool;
    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '港邊人員視角 · MODULE 05',
        color: '#F0648C',
        title: '疫情自動追溯',
        badges: ['AIS × WHO IHR · 規則式評分'],
        source: 'mock',
        actionsHtml: '<button class="simbtn" id="epiSim">模擬偵測</button>',
      }) +
      template +
      '</div>';
    swimEls = {
      berth: $('#epiBerth'),
      evt: $('#epiEvt'),
      hit: $('#epiHit'),
      axis: $('#epiAxis'),
      sl: $('#epiSl'),
    };
    map = createWorldMap($('#epiMap'), () => {
      if (curId) map.renderVessel(current(), computeHits(current().ports, current().events));
    });
    renderPipe();
    select(sortedFleet()[0].id);
    bindCursor();
  },
  show() {
    map.resize();
    if (curId) {
      // section 從 mount() 當下的 display:none 變 .active 後，#epiSl 才有真實
      // clientWidth；swimlane 與地圖一樣，首次 show() 前用 0 寬算出的泳道座標
      // 是錯的，故比照 map.resize() 的既有慣例在此重繪一次（同 M-t4-1 的成因）。
      const v = current();
      const hits = computeHits(v.ports, v.events);
      map.renderVessel(v, hits);
      renderSwimlane(swimEls, v, hits, timeRange);
      positionCursor();
    }
  },
};
export default s;

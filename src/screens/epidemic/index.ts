/* Epidemic screen — 疫情自動追溯（2026-07-05 spec 改版）。
   互動基準：docs/preview/preview-epidemic-redesign.html。
   本檔為膠合層：規則式評分/時空交叉比對走 ./correlate、Mapbox 地圖走 ./worldmap、
   Epi-Gantt 泳道走 ./swimlane（皆單一真相來源，不在此重複定義）。Task 3 靜態骨架 +
   Task 4 地圖 + Task 5 泳道（select() 全連動：地圖/泳道/右欄同步、游標歸位 now）+
   Task 6 時間游標（拖曳/點擊/鍵盤，船沿真實航線插值 + 命中脈衝）+
   Task 7 管線進場動畫（playPipe）+ 點階段看來源（.pdetail）+ 模擬偵測
   （池兩發 escalate/newship + 池盡重置 + 9s 自動流入）+ show/hide 生命週期已完成。 */
import type { Screen, ScreenCtx } from '../types';
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
let fleet0: FleetVessel[] = []; // 池盡重置用的初始船隊複本；mount() 當下、任何 inflow 操作前捕捉
let pipe: PipeStage[] = [];
let curId: string | null = null;
let cursorDay = 0;
let timeRange: EpidemicSnapshot['timeRange'] = { startDate: '', endDate: '', startDay: 0, now: 0 };
let inflowPool: EpidemicSnapshot['inflowPool'] = [];
let inflowIdx = 0;
let sectionEl: HTMLElement;
let sCtx: ScreenCtx;
let map: WorldMap;
let swimEls: SwimlaneEls;
let autoFlowArmed = false; // 9s 自動流入計時器只武裝一次（比照 policy 既有慣例）
let autoFlowTimer: ReturnType<typeof setTimeout> | null = null;

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
    const det = document.createElement('div');
    det.className = 'pdetail';
    det.innerHTML = stage.detail
      .map((d) => (d.startsWith('來源') ? `<a href="#">${d}</a>` : `<div>${d}</div>`))
      .join('');
    el2.appendChild(det);
    el2.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.pdetail').forEach((d) => {
        if (d !== det) d.classList.remove('show');
      });
      det.classList.toggle('show');
    });
    el.appendChild(el2);
    if (i < pipe.length - 1) {
      const f = document.createElement('div');
      f.className = 'pflow' + (pipe[i]._state === 'done' ? ' lit' : '');
      el.appendChild(f);
    }
  });
}
document.body.addEventListener('click', () => {
  document.querySelectorAll('.pdetail').forEach((d) => d.classList.remove('show'));
});

function playPipe(): void {
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (rm) {
    pipe.forEach((stage) => {
      stage._state = stage.run ? 'run' : 'done';
    });
    pipe[4]._state = 'wait';
    renderPipe();
    return;
  }
  pipe.forEach((stage) => {
    stage._state = 'wait';
  });
  renderPipe();
  let i = 0;
  const seq = (): void => {
    if (i >= pipe.length) return;
    pipe[i]._state = pipe[i].run ? 'run' : 'done';
    renderPipe();
    i++;
    setTimeout(seq, 360);
  };
  seq();
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

/* ── 模擬偵測：池兩發（escalate/newship）+ 池盡重置 ── */
function simulate(): void {
  if (inflowIdx >= inflowPool.length) {
    fleet = fleet0.map((v) => ({ ...v }));
    inflowIdx = 0;
    if (curId && !fleet.find((x) => x.id === curId)) curId = sortedFleet()[0].id;
    renderFleet();
    sCtx.ui.toast({ title: '疫情自動追溯', message: '模擬池重置 · 回到初始船隊' });
    if (curId) select(curId);
    return;
  }
  const f = inflowPool[inflowIdx++];
  if (f.kind === 'escalate') {
    const v = fleet.find((x) => x.id === f.targetId)!;
    v.factors = f.factors;
    v.events = [...v.events, f.event];
    v.intel = [f.intel, ...v.intel.filter((i) => i.hit)];
    v._unread = v.id !== curId;
    renderFleet();
    if (v.id === curId) select(v.id);
  } else if (f.kind === 'newship') {
    fleet = [{ ...f.vessel, _unread: true }, ...fleet];
    renderFleet();
  }
  sCtx.ui.toast({ title: '疫情自動追溯', message: f.toast });
}

const s: Screen = {
  async mount(el, ctx) {
    sectionEl = el;
    sCtx = ctx;
    const snap: EpidemicSnapshot = await ctx.data.epidemic.snapshot();
    fleet = snap.fleet.map((v) => ({ ...v }));
    fleet0 = fleet.map((v) => ({ ...v })); // 池盡重置用的初始複本，須在任何 inflow 操作前捕捉
    // 靜態管線初值（比照 preview reduced-motion 終態：末站待推播、其餘依 run 旗標 done/run）；
    // mount() 完成後 router 立即呼叫 show()，playPipe() 會接手播放/改寫這份初值，
    // 此處只是避免 show() 前那一瞬有未賦值畫面。
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
    $('#epiSim').addEventListener('click', simulate);
    // 本頁 active 時的視窗 resize（對齊 dispatch/twin 定案手法）
    window.addEventListener('resize', () => {
      if (!sectionEl.classList.contains('active')) return;
      map.resize();
      if (curId) {
        const v = current();
        renderSwimlane(swimEls, v, computeHits(v.ports, v.events), timeRange);
      }
    });
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
    playPipe();
    if (!autoFlowArmed) {
      autoFlowArmed = true;
      autoFlowTimer = setTimeout(() => {
        autoFlowTimer = null;
        if (inflowIdx === 0 && sectionEl.classList.contains('active')) simulate();
      }, 9000);
    }
  },
  hide() {
    if (autoFlowTimer) {
      clearTimeout(autoFlowTimer);
      autoFlowTimer = null;
    }
  },
};
export default s;

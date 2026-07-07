/* Alert screen — 自動警報推播（2026-07-07 spec 改版）。
   互動基準：docs/preview/preview-alert-redesign.html（v2，已驗收）。
   Task 3：三分割骨架 + alert.css + 靜態渲染（KPI/事件流/軌跡展開/手機/漏斗）+
   篩選/Ack/下鑽（非地圖部分）。Task 4：地圖膠合層走 ./broadcastmap（真 Mapbox，
   cell/圍欄/pdot/波紋）+ renderMap 下鑽連動 + show()/resize 生命週期。Task 5：
   #simBtn 綁 simulate()（池兩發全鏈路動畫 + 池盡重置，reduced-motion 直達終態）+
   cancelTimers()/hide()（切頁不洩漏 timeline，半途中斷不回滾）。 */
import type { Screen, ScreenCtx } from '../types';
import type { AlertSnapshot, AlertEvent, AlertSev, AlertFunnel } from '../../data/types';
import { funnelRates, sumDelivered, FUNNEL_STEPS } from './funnel';
import { createBroadcastMap, type BroadcastMap } from './broadcastmap';
import { screenHeader } from '../../ui/components';
import { prefersReduced } from '../settings/storage';
import template from './alert.html?raw';
import './alert.css';

/* runtime 擴充欄位：_unread（未讀角標，Task 5 模擬事件流入使用）、
   _traceStates（分級軌跡逐節亮燈狀態，Task 5 演練動畫使用；本 task 靜態卡一律
   undefined，traceHtml() 呼叫處正規化為 null → 四節點全亮，見 renderFeed()）。
   AlertEvent 本身不帶這兩欄，只在模組內的複本上掛（同 epidemic FleetVessel 手法）。 */
type FeedItem = AlertEvent & { _unread?: boolean; _traceStates?: string[] | null };
type FunnelKey = (typeof FUNNEL_STEPS)[number][0];

const SEVC: Record<AlertSev, string> = { red: '#FF7A59', orange: '#F5A54A', notice: '#9fb0c3', clear: '#35E0A6' };
const SEVN: Record<AlertSev, string> = { red: '紅色警報', orange: '橙色警戒', notice: '作業提示', clear: '解除' };
const SRCC: Record<AlertEvent['source'], string> = {
  epidemic: '#F0648C',
  dispatch: '#F5A54A',
  weather: '#38BDF8',
  system: '#6b7a8d',
};

const SIM_BTN = '<button class="lg lg-btn lg-btn--accent lg-btn--sm" data-lg id="simBtn">模擬事件</button>';

let feed: FeedItem[] = [];
let drillPool: AlertEvent[] = [];
let snap0: AlertSnapshot;
let curId: string | null = null;
let curCat = 'all';
let sectionEl: HTMLElement;
let sCtx: ScreenCtx;
let map: BroadcastMap;

/* 模擬事件演練（Task 5）：池兩發全鏈路動畫 + 池盡重置。timers 集中管理，
   切頁（hide()）時全數 cancelTimers()，避免動畫 timeline 洩漏到別頁（同 policy 前例）。 */
let poolIdx = 0;
let simming = false;
const timers: number[] = [];
const later = (fn: () => void, ms: number): void => {
  timers.push(window.setTimeout(fn, ms));
};
function cancelTimers(): void {
  timers.forEach(clearTimeout);
  timers.length = 0;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => sectionEl.querySelector(sel) as T;

function renderKpis(): void {
  const k = snap0.kpi;
  $('.keyrow').innerHTML =
    `<div class="kchip">今日發布<b id="kPub">${k.published}</b></div>` +
    `<div class="kchip">觸及 人員/船舶<b>${k.reachedPeople.toLocaleString()} / ${k.reachedShips}</b></div>` +
    `<div class="kchip hi">平均送達延遲<b>${k.avgSec} s</b></div>` +
    `<div class="kchip">送達率<b>${k.deliveryRate}%</b></div>`;
}

/* 分級軌跡（下鑽展開）：四節點 偵測→規則命中→分級→發布。
   st(i)：states===null（含未曾演練過的靜態卡）→ 全部視為已完成點亮；
   states[i]==='done'→已完成、'run'→進行中、其餘→未開始（preview 修過的坑，照 v2 版轉錄）。 */
function traceHtml(ev: AlertEvent, states: string[] | null): string {
  const t = ev.trace;
  const st = (i: number): string => {
    if (!states) return 'on';
    return states[i] === 'done' ? 'on' : states[i] === 'run' ? 'on run' : '';
  };
  const node = (i: number, b: string, sub: string): string =>
    `<div class="tnode ${st(i)}"><span class="lamp"></span><span><b>${b}</b><span class="sub">${sub}</span></span></div>`;
  const srcLabel = ev.source === 'epidemic' ? '疫情自動追溯' : ev.source === 'dispatch' ? '微氣候派工' : '氣象監測';
  return (
    '<div class="trace">' +
    node(0, '偵測', srcLabel) +
    node(1, '規則命中', `${t.rule} · <span class="tmono">${t.threshold}</span>`) +
    node(2, '分級', `<span style="color:${SEVC[ev.sev]}">${SEVN[ev.sev]}</span> · PWS ${t.pws}`) +
    node(3, '發布', `<span class="tmono">${t.ch} · +${t.publishSec}s</span>`) +
    '</div>'
  );
}

function renderFeed(): void {
  const el = $('#afeed');
  el.innerHTML = '';
  feed
    .filter((e) => curCat === 'all' || e.cat === curCat)
    .forEach((ev) => {
      const c = SEVC[ev.sev];
      const card = document.createElement('div');
      card.className = 'ecard' + (ev.id === curId ? ' sel' : ev.sev === 'clear' || ev.sev === 'notice' ? ' dim' : '');
      card.style.setProperty('--sv', c);
      card.innerHTML =
        `<div class="etop"><span class="sdot" style="background:${SRCC[ev.source]};box-shadow:0 0 7px ${SRCC[ev.source]}66"></span>` +
        `<span class="etitle" style="color:${ev.sev === 'red' || ev.sev === 'orange' ? c : '#aab6c4'}">${ev.title}</span>` +
        `<span class="etime">${ev.time}</span></div>` +
        `<div class="ebody">${ev.body}</div>` +
        `<div class="emeta"><span class="chb">${ev.ch}</span>` +
        `<span class="chb" style="border-color:${c}55;color:${c}">${SEVN[ev.sev]}</span>` +
        `<button class="ackbtn ${ev.acked ? 'done' : 'todo'}" style="--sv:${c}">${ev.acked ? '已確認' : '確認'}</button></div>` +
        traceHtml(ev, ev._traceStates ?? null) +
        (ev._unread ? '<span class="unread"></span>' : '');
      (card.querySelector('.ackbtn') as HTMLButtonElement).addEventListener('click', (e) => {
        e.stopPropagation();
        if (!ev.acked) {
          ev.acked = true;
          renderFeed();
        }
      });
      card.addEventListener('click', () => {
        ev._unread = false;
        select(ev.id);
      });
      el.appendChild(card);
    });
}

function renderPhone(ev: AlertEvent, drill: boolean): void {
  const scr = $('#aphoneScr');
  const pa = $('#apalert');
  const ph = $('#aphone');
  pa.classList.remove('show');
  ph.classList.remove('shake');
  const s = ev.sms;
  if (ev.sev === 'red') {
    pa.innerHTML =
      '<div class="ptag"><span class="tri">▲</span>緊急警報 EMERGENCY ALERT</div>' +
      `<h5>${s.event}</h5>` +
      `<div class="pbody">【${s.unit}】影響區域：${s.area}。${s.action}。</div>` +
      `<div class="pch">${ev.ch} · PWS 緊急警報 · ${ev.time}</div>`;
    pa.classList.add('show');
    if (drill && !prefersReduced()) ph.classList.add('shake');
    scr.innerHTML = '';
  } else {
    scr.innerHTML =
      `<div class="banner ${ev.sev === 'orange' ? 'warn' : ''}"><div class="bfrom">▲ ${SEVN[ev.sev]} · ${ev.ch}</div>` +
      `<b>${s.event}</b><br>【${s.unit}】${s.area} · ${s.action}</div>` +
      '<div class="banner old"><div class="bfrom">▲ 前一則</div>港區平均風速18m/s，高空作業停止</div>';
  }
}

function renderFunnel(ev: AlertEvent, countUp: boolean): void {
  const el = $('#afunnel');
  el.innerHTML = ev.funnels
    .map((f: AlertFunnel, fi: number) => {
      const max = f.triggered;
      const rates = funnelRates(f);
      const pctOf = (k: FunnelKey): number => (k === 'triggered' ? 0 : rates[k]);
      const steps = FUNNEL_STEPS.map(([k, nm], i) => {
        const v = f[k];
        return (
          `<div class="fstep"><span class="nm">${nm}</span>` +
          `<div class="bar" data-fi="${fi}" data-k="${k}" style="width:${(v / max) * 100}%"></div>` +
          `<span class="num" data-num data-fi="${fi}" data-k="${k}">${countUp ? 0 : v.toLocaleString()}</span>` +
          `<span class="pct">${i === 0 ? '' : pctOf(k) + '%'}</span></div>`
        );
      }).join('');
      return (
        `<div class="fun"><div class="funlbl"><span>${f.label}</span>` +
        `<b>${sumDelivered([f]).toLocaleString()} 送達</b></div><div class="frail">${steps}</div></div>`
      );
    })
    .join('');
  if (countUp && !prefersReduced()) {
    el.querySelectorAll<HTMLElement>('[data-num]').forEach((sp) => {
      const f = ev.funnels[Number(sp.dataset.fi)];
      const target = f[sp.dataset.k as FunnelKey];
      const t0 = performance.now();
      const tick = (now: number): void => {
        const p = Math.min((now - t0) / 900, 1);
        sp.textContent = Math.round(target * p).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  } else if (countUp) {
    el.querySelectorAll<HTMLElement>('[data-num]').forEach((sp) => {
      const f = ev.funnels[Number(sp.dataset.fi)];
      sp.textContent = f[sp.dataset.k as FunnelKey].toLocaleString();
    });
  }
}

function renderMap(ev: AlertEvent): void {
  map.renderEvent(ev);
}

function select(id: string): void {
  curId = id;
  const ev = feed.find((e) => e.id === id)!;
  renderFeed();
  renderFunnel(ev, false);
  renderPhone(ev, false);
  renderMap(ev);
}

/* 演練池兩發全鏈路動畫 + 池盡重置（逐字轉錄 docs/preview/preview-alert-redesign.html
   的 simulate()，型別化）。防重入：simming 為 true 時直接早退。 */
function simulate(): void {
  if (simming) return;
  const btn = $<HTMLButtonElement>('#simBtn');
  if (poolIdx >= drillPool.length) {
    feed = snap0.feed.map((e) => ({ ...e }));
    poolIdx = 0;
    select(snap0.feed[0].id);
    $('#kPub').textContent = String(snap0.kpi.published);
    sCtx.ui.toast({ title: '自動警報推播', message: '演練池重置 · 回到初始事件流' });
    return;
  }
  const ev: FeedItem = { ...drillPool[poolIdx++], _unread: true };
  simming = true;
  btn.disabled = true;
  const toastMsg =
    ev.sev === 'red'
      ? '緊急警報已發布 · 紅色警報 · 全港廣播'
      : `警訊通知已發布 · ${SEVN[ev.sev]} · 觸及 ${sumDelivered(ev.funnels).toLocaleString()} 人`;
  const finish = (): void => {
    simming = false;
    btn.disabled = false;
    $('#kPub').textContent = String(snap0.kpi.published + poolIdx);
  };
  if (prefersReduced()) {
    ev._traceStates = null;
    feed = [ev, ...feed];
    curId = ev.id;
    renderFeed();
    renderMap(ev);
    renderPhone(ev, false);
    renderFunnel(ev, true);
    sCtx.ui.toast({ title: '自動警報推播', message: toastMsg });
    finish();
    return;
  }
  // 全鏈路動畫：插卡（軌跡逐節亮）→ 波紋+cell stagger → 手機 → 漏斗滾數字
  ev._traceStates = ['run', 'wait', 'wait', 'wait'];
  feed = [ev, ...feed];
  curId = ev.id;
  renderFeed();
  map.renderEvent({ ...ev, cellsLit: [] }); // 圍欄+pdot 先上、cell 等 stagger（later 內 litCells 補亮）
  const TS: (string[] | null)[] = [
    ['done', 'run', 'wait', 'wait'],
    ['done', 'done', 'run', 'wait'],
    ['done', 'done', 'done', 'run'],
    null,
  ];
  TS.forEach((st, i) => {
    later(() => {
      ev._traceStates = st;
      renderFeed();
    }, 600 + i * 600);
  });
  later(() => {
    map.ripple(ev.lngLat);
    map.litCells(ev.cellsLit, true);
  }, 2200);
  later(() => {
    renderPhone(ev, true);
    sCtx.ui.toast({ title: '自動警報推播', message: toastMsg });
  }, 2200 + Math.min(ev.cellsLit.length * 110, 1100) + 300);
  later(() => {
    renderFunnel(ev, true);
  }, 3600);
  later(finish, 5200);
}

const s: Screen = {
  async mount(el, ctx) {
    sectionEl = el;
    sCtx = ctx;
    const snap: AlertSnapshot = await ctx.data.alert.snapshot();
    snap0 = snap;
    feed = snap.feed.map((e) => ({ ...e }));
    drillPool = snap.drillPool;
    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '港區廣播中心 · MODULE 06',
        color: '#FF7A59',
        title: '自動警報推播',
        badges: ['CELL BROADCAST · PWS 對映'],
        source: 'mock',
        actionsHtml: SIM_BTN,
      }) +
      template +
      '</div>';
    renderKpis();
    map = createBroadcastMap($('#amap'), snap.cells, () => {
      if (curId) renderMap(feed.find((e) => e.id === curId)!);
    });
    $('.fbar').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('.fchip') as HTMLElement | null;
      if (!b) return;
      curCat = b.dataset.cat ?? 'all';
      sectionEl.querySelectorAll('.fchip').forEach((x) => x.classList.toggle('is-on', x === b));
      renderFeed();
    });
    $('#simBtn').addEventListener('click', simulate);
    select(snap.feed[0].id);
    // 本頁 active 時的視窗 resize（對齊 epidemic/dispatch 定案手法）
    window.addEventListener('resize', () => {
      if (!sectionEl.classList.contains('active')) return;
      map.resize();
    });
  },
  show() {
    // section 從 mount() 當下的 display:none 變 .active 後容器才有真實尺寸，
    // 首次 show() 前用 0 寬量出的地圖畫布是錯的，故比照 epidemic/dispatch 的既有慣例在此補一次 resize()。
    map.resize();
  },
  hide() {
    // 切出時停掉演練 timeline（同 policy 前例：動畫不可洩漏到別頁）；若中斷於演練半途，
    // 只釋放 simming 狀態、鈕恢復可按——半途畫面允許停在當下，重進頁可再操作，不自動回滾。
    const wasSimming = simming;
    cancelTimers();
    if (!wasSimming) return;
    simming = false;
    const btn = sectionEl.querySelector<HTMLButtonElement>('#simBtn');
    if (btn) btn.disabled = false;
  },
};
export default s;

/* Dispatch screen — 短時微氣候 · 即時派工建議（2026-07-05 spec 改版）。
   互動基準：docs/preview/preview-dispatch-redesign.html。
   本檔為膠合層：一切內容從當前情境（cur）重渲染；結論標記解析走 ./conclusion。 */
import type { Screen, ScreenCtx } from '../types';
import type { DispatchScenario, DispatchCard, HorizonMetrics, LiveAnchor, OpRow, OpStatus, RainLevel } from '../../data/types';
import { screenHeader } from '../../ui/components';
import { parseConclusion } from './conclusion';
import { prefersReduced } from '../settings/storage';
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

/* 模型更新倒數（spec §7-4）：10:00 自動歸零 → 推論動畫 ~2s → windAvg/windGust 視覺抖動 + toast → 重置。
   reduced-motion 降級：推論不經 2s 轉圈直接完成。 */
const RM = () => prefersReduced();
const TOTAL = 600;                 // 10:00（spec 定案：真實系統節奏）
let remain = TOTAL;
let inferring = false;
let tick: ReturnType<typeof setInterval> | null = null;

function fmt(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function paintRing(): void {
  $('#ring').style.setProperty('--pp', `${(remain / TOTAL) * 100}%`);
  $('#cntT').textContent = inferring ? '推論中' : fmt(remain);
}
let inferenceId = 0;   // 情境切換/重觸發時讓晚到的重抓結果作廢，不要無預警覆蓋畫面

stopInference = () => {            // 覆寫 Task 4 掛點：情境切換時中止推論動畫
  inferenceId++;
  inferring = false;
  $('#cnt').classList.remove('running');
  paintRing();
};

/* 2026-07-14：倒數歸零時真的重打一次後端（ctx.data.dispatch.snapshot()），
   不再是純視覺抖動——stable 情境會拿到新的 nowcast/cwa/liveAnchors，rain/typhoon
   仍是純 mock，重抓對它們是無害的 no-op。
   已實測後端 /api/v1/dispatch/risk 回應時間不穩定（冷啟動 ~8s，實測瀏覽器情境下偶爾 20 秒以上未回應，
   已寫入後端規格書請查根因），前端不能無限期等待，故加 10 秒逾時：逾時或連線失敗都維持現有資料、
   用 toast 誠實告知這次沒抓到，不假裝成功；逾時後若原本的請求晚到才回來，直接丟棄，不再套用。 */
const REFRESH_TIMEOUT_MS = 10000;

function runInference(): void {
  if (inferring) return;           // 不可重入
  inferring = true;
  $('#cnt').classList.add('running');
  remain = TOTAL;
  paintRing();
  const id = ++inferenceId;
  later(() => {
    const now = new Date();
    const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    let settled = false;
    const finish = (ok: boolean, timedOut: boolean): void => {
      if (settled || id !== inferenceId) return;
      settled = true;
      inferring = false;
      $('#cnt').classList.remove('running');
      renderAll();
      bubbleRefresh?.();
      sCtx.ui.toast(
        ok
          ? { title: 'RandomForest 已更新', message: `${timeLabel} 重新取得後端最新預測` }
          : {
              title: '本次更新失敗',
              message: `${timeLabel} ${timedOut ? '後端回應逾時（10秒）' : '後端連線失敗'}，畫面維持原有資料`,
            },
      );
      paintRing();
    };
    const timeoutId = setTimeout(() => finish(false, true), REFRESH_TIMEOUT_MS);
    sCtx.data.dispatch
      .snapshot()
      .then((snap) => {
        clearTimeout(timeoutId);
        if (settled || id !== inferenceId) return;   // 已逾時放棄，晚到的結果不再套用
        scenarios = snap.scenarios;
        finish(true, false);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        finish(false, false);
      });
  }, RM() ? 0 : 2000);
}
/* DEV-only 測試鉤：倒數 10 分鐘，驗收腳本等不到自然歸零，需一個觸發入口
   （比照 preview 基準檔的 __forceUpdate；import.meta.env.DEV 保證不進 production build）。 */
if (import.meta.env.DEV) {
  (window as unknown as { __dispatchForceUpdate?: () => void }).__dispatchForceUpdate = runInference;
}

/* 六級雨量分級 → hero 風險色三態（spec §3：大字塊底色 = 當前風險色） */
const WXCLS: Record<RainLevel, 'ok' | 'warn' | 'stop'> =
  { 無: 'ok', 小雨: 'ok', 大雨: 'warn', 豪雨: 'stop', 大豪雨: 'stop', 超大豪雨: 'stop' };
const SYM: Record<OpStatus, string> = { stop: '✕ ', warn: '! ', ok: '' };

interface HeroValues {
  rainLevel: RainLevel;
  beaufort: number;
  windAvg: number | null;
  windGust: number | null;
  riskLevel?: OpStatus;   // 2026-07-15：後端 dispatch_risk_level 收斂後的值，有值時取代 WXCLS 查表
}

/* hero 大字塊的燈色/數字：拖曳時間軸時會用不同時間點的資料重繪這一段，
   CWA 沒有精確 m/s（官方預報只給蒲福風級區間），windAvg/windGust 傳 null 時顯示「—」，
   不假裝有精確數字。riskLevel 有值（live資料的H1~H4錨點）時優先用它決定底色，
   否則退回 WXCLS[rainLevel] 查表（mock情境、CWA zone一律走這條路，CWA沒有dispatch_risk_level）。 */
function renderHeroValues(n: HeroValues): void {
  const wx = $('#wx');
  wx.classList.remove('ok', 'warn', 'stop');
  wx.classList.add(n.riskLevel ?? WXCLS[n.rainLevel]);
  $('#wxlvl').textContent = n.rainLevel === '無' ? '無降雨' : n.rainLevel;
  $('#wxbf').textContent = `${n.beaufort} 級`;
  $('#wxavg').textContent = n.windAvg == null ? '—' : n.windAvg.toFixed(1);
  $('#wxgust').textContent = n.windGust == null ? '—' : n.windGust.toFixed(1);
}

function formatMetrics(m: { csi: number | null; pod: number | null; far: number | null }): string {
  const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(2));
  return `CSI ${fmt(m.csi)} · POD ${fmt(m.pod)} · FAR ${fmt(m.far)}`;
}

const HORIZON_KEYS = ['H1', 'H2', 'H3', 'H4'] as const;
type HorizonKey = (typeof HORIZON_KEYS)[number];

/* liveAnchors（H1~H4）裡離目標分鐘數最近的一筆；平手取較早的一筆，同時回傳對應的H1~H4 key
   （依陣列位置而非offsetMinutes數值判斷，避免依賴30/60/90/120這種寫死的分鐘數）供查
   metricsByHorizon用。rain/typhoon情境與live取不到資料時liveAnchors是undefined，回傳null
   交由呼叫端退回靜態nowcast。 */
function pickAnchor(sc: DispatchScenario, minutes: number): { anchor: LiveAnchor; horizonKey: HorizonKey } | null {
  const anchors = sc.liveAnchors;
  if (!anchors || !anchors.length) return null;
  let bestIdx = 0;
  let bestDiff = Math.abs(anchors[0].offsetMinutes - minutes);
  for (let i = 1; i < anchors.length; i++) {
    const diff = Math.abs(anchors[i].offsetMinutes - minutes);
    if (diff < bestDiff) { bestIdx = i; bestDiff = diff; }
  }
  return { anchor: anchors[bestIdx], horizonKey: HORIZON_KEYS[Math.min(bestIdx, HORIZON_KEYS.length - 1)] };
}

function metricsFor(sc: DispatchScenario, horizonKey: HorizonKey): HorizonMetrics | null {
  return sc.metricsByHorizon?.[horizonKey] ?? null;
}

function renderHero(sc: DispatchScenario): void {
  renderHeroValues(sc.nowcast);
  $('#wxmet').textContent = formatMetrics(sc.metrics);
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
        badges: ['RandomForest 0-120 min'],
        source: 'live',
        actionsHtml: segctlHtml(),
      }) +
      template +
      '</div>';
    renderAll();
    const N_END = 55, C3_END = 77.5;
    let pct = 20;
    function updateBubble(): void {
      const sc = scn();
      const tl = $('#tl'), knob = $('#tlknob'), bub = $('#tlbub');
      let txt: string, zone: 'N' | '3' | '6';
      if (pct <= N_END) {
        const min = Math.round((pct / N_END) * 120 / 5) * 5;
        const picked = pickAnchor(sc, min);
        const anchor = picked?.anchor;
        txt = `${min === 0 ? 'NOW' : `+${min} min`} · RandomForest · ${(anchor ?? sc.nowcast).rainLevel}`;
        zone = 'N';
        if (anchor) {
          renderHeroValues(anchor);
          if (anchor.suggestion) $('#concl').textContent = anchor.suggestion;   // 沒有時維持前一次的渲染結果
          const hm = picked ? metricsFor(sc, picked.horizonKey) : null;
          if (hm) $('#wxmet').textContent = formatMetrics(hm);
        }
        $('#wxwin').textContent = `${min === 0 ? '現在' : `未來 ${min} 分鐘`} · 港區`;
      } else if (pct <= C3_END) {
        txt = `+3h · CWA · ${sc.cwa[0].rainLevel}`; zone = '3';
        renderHeroValues({ rainLevel: sc.cwa[0].rainLevel, beaufort: sc.cwa[0].beaufort, windAvg: null, windGust: null });
        $('#wxmet').textContent = 'CSI — · POD — · FAR —';   // CWA無對應評估指標，不假裝有
        $('#wxwin').textContent = 'CWA官方預報 +3h · 港區';
      } else {
        txt = `+6h · CWA · ${sc.cwa[1].rainLevel}`; zone = '6';
        renderHeroValues({ rainLevel: sc.cwa[1].rainLevel, beaufort: sc.cwa[1].beaufort, windAvg: null, windGust: null });
        $('#wxmet').textContent = 'CSI — · POD — · FAR —';
        $('#wxwin').textContent = 'CWA官方預報 +6h · 港區';
      }
      knob.style.left = `${pct}%`;
      bub.style.left = `${Math.min(Math.max(pct, 12), 88)}%`;   // 泡泡不出界
      bub.textContent = txt;
      tl.setAttribute('aria-valuenow', String(Math.round(pct)));
      $('#hN').classList.toggle('hl', zone === 'N');
      $('#h3').classList.toggle('hl', zone === '3');
      $('#h6').classList.toggle('hl', zone === '6');
    }
    bubbleRefresh = updateBubble;
    const tlEl = $('#tl');
    function setPct(e: PointerEvent): void {
      const r = tlEl.getBoundingClientRect();
      pct = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
      updateBubble();
    }
    let dragging = false;
    tlEl.addEventListener('pointerdown', (e) => {
      dragging = true;
      try { tlEl.setPointerCapture(e.pointerId); } catch { /* 合成事件/邊界情況無 active pointer */ }
      setPct(e);
    });
    tlEl.addEventListener('pointermove', (e) => { if (dragging) setPct(e); });
    tlEl.addEventListener('pointerup', () => { dragging = false; });
    tlEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { pct = Math.max(0, pct - 2.5); updateBubble(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { pct = Math.min(100, pct + 2.5); updateBubble(); e.preventDefault(); }
      /* #tl 是 div[role=slider]，不在 main.ts 全域導覽鍵的 INPUT/TEXTAREA/SELECT bail-out 內：
         focus 在時間軸上按數字/Enter 會誤觸全站導覽，必須在此隔離（確定性 bug，非猜測）。 */
      if (/^[0-9]$/.test(e.key) || e.key === 'Enter') e.stopPropagation();
    });
    updateBubble();   // 首繪
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
      bubbleRefresh?.();       // Task 5：泡泡文字跟上新情境
      sCtx.ui.toast({ title: `已切換情境：${scn().label}`, message: TOAST[cur] });
    });
  },
  show() {
    paintRing();
    if (!tick) tick = setInterval(() => {
      if (inferring) return;
      remain -= 1;
      if (remain <= 0) { runInference(); return; }
      paintRing();
    }, 1000);
  },
  hide() {
    if (tick) { clearInterval(tick); tick = null; }   // 切走不背景倒數（spec §7-4）
    cancelTimers();                                   // 進行中的推論動畫一併取消
    stopInference();
  },
};
export default s;

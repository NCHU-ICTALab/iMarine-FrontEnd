/* 底部時間軸：一條 slider、兩種語意。
   即時回放：value=真實 epoch ms，scrub → scene.refresh + 趨勢游標。
   未來推演：value=NOW+分鐘（0-1440），場景凍結（不 refresh），只推 KPI/甘特。
   播放/倍速沿用上游 playback.advancePerFrame——純比例公式 rangeMs*step/4800，
   單位無關，回放（ms）與推演（分鐘）兩種軸都適用。
   mode 狀態由 index.ts 以 modeApi 參數注入（不 import './index'，避免循環相依）。 */
import { advancePlayhead } from './time/playback';
import { fromMs, toMs, nowMs, fmtClock, type TwinScene } from './scene-init';
import type { PanelsApi } from './panels';

type TabMode = 'replay' | 'future';
export interface ModeApi { get(): TabMode; onChange(fn: (m: TabMode) => void): void; }
export interface TimelineApi {
  currentReplayMs(): number;
  currentFutureMin(): number;
  frozenMs(): number;
  onScrub(fn: (m: TabMode) => void): void;
  stop(): void;
}

const FUTURE_MIN = 1440;
const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtFuture = (min: number) => `NOW +${pad2(Math.floor(min / 60))}:${pad2(Math.round(min % 60))}`;

export function initTimeline(el: HTMLElement, scene: TwinScene, panels: PanelsApi, modeApi: ModeApi): TimelineApi {
  const slider = el.querySelector<HTMLInputElement>('#tslider')!;
  const tclock = el.querySelector<HTMLElement>('#tclock')!;
  const tlLabel = el.querySelector<HTMLElement>('#tlLabel')!;
  const playBtn = el.querySelector<HTMLButtonElement>('#play')!;
  const spVal = el.querySelector<HTMLElement>('#spVal')!;

  let replayMs = nowMs, futureMin = 0, frozen = nowMs;
  let speed = 5, playing = false, raf = 0;
  // 播放頭：float 累加器。不可用 slider.value 當累加器——range input 會把值 snap 到 step，
  // ×1 每幀 sub-step 增量被捨去→凍結（見 time/playback.advancePlayhead）。播放時 seed 自當前 thumb。
  let playHead = nowMs;
  const scrubListeners: Array<(m: TabMode) => void> = [];

  // Kit 的 slider 填色只在 input 事件重繪；播放時程式改值需手動補（沿用上游 paintFill 手法）。
  // #tslider 是掛載後才入 DOM，Kit 開機掃描掃不到，補跑一次 behaviors.slider（同 carbon 手法；
  // lg.d.ts 已於複審 Fix 7 補齊 slider 型別，不需 cast）。
  try {
    window.LiquidGlass.behaviors.slider?.(slider);
  } catch { /* Kit 缺 behaviors.slider 時原生 range 仍可用 */ }
  const paintFill = () => {
    const mn = +slider.min, mx = +slider.max;
    slider.style.setProperty('--lg-fill', `${mx > mn ? ((+slider.value - mn) / (mx - mn)) * 100 : 0}%`);
  };

  function applyModeToSlider(): void {
    if (modeApi.get() === 'replay') {
      slider.min = String(fromMs); slider.max = String(toMs); slider.step = '60000';
      slider.value = String(replayMs);
      tlLabel.textContent = `AIS 回放 · 過去 24 小時（${fmtClock(fromMs)} → ${fmtClock(toMs)}）`;
    } else {
      slider.min = '0'; slider.max = String(FUTURE_MIN); slider.step = '1';
      slider.value = String(futureMin);
      tlLabel.textContent = '沙盤推演 · 未來 24 小時（NOW = 回放凍結時刻）';
    }
    sync();
  }

  function sync(): void {
    if (modeApi.get() === 'replay') {
      replayMs = +slider.value;
      tclock.textContent = fmtClock(replayMs);
      scene.refresh(replayMs);
      panels.renderTrend(replayMs);
    } else {
      futureMin = +slider.value;
      tclock.textContent = fmtFuture(futureMin);
    }
    paintFill();
    scrubListeners.forEach((fn) => fn(modeApi.get()));
  }

  function stopPlay(): void { playing = false; playBtn.textContent = '▶'; if (raf) cancelAnimationFrame(raf); }

  slider.addEventListener('input', () => { stopPlay(); sync(); });
  playBtn.addEventListener('click', () => {
    if (raf) cancelAnimationFrame(raf);
    playing = !playing; playBtn.textContent = playing ? '⏸' : '▶';
    if (playing) playHead = +slider.value; // seed float 播放頭自當前 thumb（snapped 起點 ok）
    const step = () => {
      if (!playing) return;
      playHead = advancePlayhead(playHead, +slider.max - +slider.min, speed, +slider.min, +slider.max);
      slider.value = String(playHead); sync(); // thumb（瀏覽器 snap 到 step，純外觀）；累加走 float 故不凍結
      raf = requestAnimationFrame(step);
    };
    if (playing) raf = requestAnimationFrame(step);
  });
  el.querySelector('#spUp')!.addEventListener('click', () => { speed = Math.min(10, speed + 1); spVal.textContent = `×${speed}`; });
  el.querySelector('#spDn')!.addEventListener('click', () => { speed = Math.max(1, speed - 1); spVal.textContent = `×${speed}`; });

  modeApi.onChange((m) => {
    stopPlay();
    if (m === 'future') frozen = replayMs; // 場景凍結在切換當下時刻
    applyModeToSlider();
  });

  applyModeToSlider();
  return {
    currentReplayMs: () => replayMs,
    currentFutureMin: () => futureMin,
    frozenMs: () => frozen,
    onScrub: (fn) => scrubListeners.push(fn),
    stop: stopPlay,
  };
}

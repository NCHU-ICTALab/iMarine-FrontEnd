/* Twin screen 外殼膠合 — 原生化改版。
   LiDAR 場景由 scene-init.ts 直繪於本 section 的 canvas（不再 iframe）；
   本檔負責：版面注入、engine 生命週期（mount/show/hide）、視角預設 bar、
   雙分頁切換骨架。右 rail 面板與時間軸的資料綁定在 panels.ts / timeline.ts
   （Task 5-8），mode 狀態以 modeApi 參數下發，不做跨模組 export。 */

import type { Screen } from '../types';
import template from './twin.html?raw';
import './twin.css';
import { initTwinScene, nowMs, type TwinScene, type ViewPreset } from './scene-init';
import { initPanels, initFuturePanels } from './panels';
import { initTimeline } from './timeline';

type TabMode = 'replay' | 'future';

let scene: TwinScene | null = null;
let stopPlayback: (() => void) | null = null; // Task 6 指派 timeline.stop；切走時停播

const s: Screen = {
  mount(el, ctx) {
    el.innerHTML = template;
    document.body.setAttribute('data-tmode', 'replay');

    const canvas = el.querySelector<HTMLCanvasElement>('#twinView')!;
    scene = initTwinScene(canvas);
    scene.refresh(nowMs);
    scene.engine.start();

    // 分頁狀態（closure 持有；Task 5-6 經參數取用）
    let mode: TabMode = 'replay';
    const modeListeners: Array<(m: TabMode) => void> = [];
    const modeApi = {
      get: () => mode,
      onChange: (fn: (m: TabMode) => void) => { modeListeners.push(fn); },
    };

    const panels = initPanels(el, ctx, scene);
    panels.renderTrend(nowMs);

    const timeline = initTimeline(el, scene, panels, modeApi);
    stopPlayback = timeline.stop;
    panels.onFilterChange(() => panels.renderTrend(timeline.currentReplayMs()));

    initFuturePanels(el, ctx, panels, timeline);

    // 視角預設
    el.querySelectorAll<HTMLButtonElement>('.vbtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.vbtn').forEach((x) => x.classList.toggle('on', x === btn));
        scene!.flyTo(btn.dataset.view as ViewPreset);
      });
    });

    // 分頁切換
    el.querySelectorAll<HTMLButtonElement>('.mtab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.tab as TabMode;
        if (next === mode) return;
        el.querySelectorAll('.mtab').forEach((x) => x.classList.toggle('on', x === btn));
        mode = next;
        document.body.setAttribute('data-tmode', mode);
        modeListeners.forEach((fn) => fn(mode));
      });
    });

    // 本頁 active 時的視窗 resize（對齊 dispatch/epidemic 定案手法）
    window.addEventListener('resize', () => {
      if (el.classList.contains('active')) scene?.engine.resize();
    });

    // ctx 與 modeApi 由 Task 5-8 接手（本 repo tsconfig 未開 noUnusedLocals/
    // noUnusedParameters，暫時未使用不報錯）
  },
  show() {
    scene?.engine.start();
    scene?.engine.resize();
  },
  hide() {
    // 型別斷言：本檔（Task 4）內 stopPlayback 只有宣告時的 null 賦值，Task 6 才會在 mount()
    // 內指派實際函式；tsc 見不到那次指派，會把整份檔案的 stopPlayback 收斂成字面型別 null
    // （即使宣告時已標註聯集型別），導致 `stopPlayback?.()` 報 TS2349。斷言回宣告型別即可，
    // 不影響執行期行為；Task 6 補上指派後這行斷言仍然安全。
    (stopPlayback as (() => void) | null)?.();
    scene?.engine.pause();
  },
};

export default s;

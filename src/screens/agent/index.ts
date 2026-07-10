/* Agent screen — 數位員工（spec 2026-07-10）。
   Task 6：screen 骨架 + shell 接入 + 開場巡檢（UX1：進頁自動健檢 → 6+1 燈號牆逐卡點燈 →
   招呼泡泡 + 3 條建議指令 chips）。開場巡檢只跑一次（booted flag），重入只重繪上次終態。
   chat 控制器（送出指令、plan-then-act、tool-calling、確認流程）是 Task 7，本檔留好接點。 */
import type { Screen, ScreenCtx } from '../types';
import type { AgentModule, DiagReport, DiagModuleReport } from '../../data/types';
import { screenHeader } from '../../ui/components';
import { prefersReduced } from '../settings/storage';
import { runDiagnostics } from './diagnostics';
import { AGENT_MODULES } from './tools';
import { createWorkspace, type Workspace } from './workspace';
import html from './agent.html?raw';
import './agent.css';

let ws: Workspace;
let ctxRef: ScreenCtx;
let sectionEl: HTMLElement;
let booted = false;           // 開場巡檢只跑一次（spec §7.1）
let lastDiag: DiagReport | null = null;

const hasKey = () => !!((import.meta as any).env?.VITE_GEMINI_API_KEY);

const SUGGESTIONS = ['整合今日港區營運摘要', '紅海事件對碳成本的影響？', '跑一次完整系統健檢'];

function moduleName(id: AgentModule | 'settings'): string {
  return id === 'settings' ? '系統設定' : AGENT_MODULES.find((m) => m.id === id)?.name ?? id;
}

/* 招呼泡泡 + 3 條建議指令 chips：模板組字＝問候 + 健檢結論（有 down/degraded 則列名並建議健檢，
   否則報 live/示範統計）。chips 點擊先只填入輸入框（Task 7 接送出）。 */
function greet(rep: DiagReport): void {
  const entries = Object.entries(rep.modules) as [AgentModule | 'settings', DiagModuleReport][];
  const okCount = entries.filter(([, v]) => v.status === 'ok').length;
  const mockCount = entries.filter(([, v]) => v.status === 'mock').length;
  const bad = entries.filter(([, v]) => v.status === 'down' || v.status === 'degraded');

  const statusLine = bad.length
    ? `已完成系統巡檢：發現 <b style="color:#F0648C">${bad.length} 項異常</b>（${bad.map(([id]) => moduleName(id)).join('、')}），建議跟我說「跑一次完整系統健檢」看修復步驟。`
    : `已完成系統巡檢：<b style="color:#35E0A6">${entries.length} 個模組全部在線</b>（${okCount} live / ${mockCount} 示範）。`;

  const thread = sectionEl.querySelector('#aThread') as HTMLElement;
  const chips = sectionEl.querySelector('#aChips') as HTMLElement;
  const input = sectionEl.querySelector('#aInput') as HTMLInputElement;

  const bub = document.createElement('div');
  bub.className = 'bub-a anim';
  bub.style.setProperty('--d', '0s');
  bub.innerHTML = `早安，我是數位員工。${statusLine}需要我做什麼？`;
  thread.appendChild(bub);

  chips.innerHTML = SUGGESTIONS.map((s) => `<button type="button" class="achip">${s}</button>`).join('');
  chips.querySelectorAll<HTMLButtonElement>('.achip').forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = btn.textContent ?? '';
      input.focus();
      // Task 7 在此接：直接送出指令
    });
  });
}

const screen: Screen = {
  mount(el, ctx) {
    ctxRef = ctx;
    sectionEl = el;
    el.innerHTML = html.replace('<!--HEADER-->', screenHeader({
      eyebrow: 'AI AGENT · 數位員工', color: '#B48CFF', title: '數位員工',
      badges: ['Tool-calling Agent', 'Self-diagnostics'],
      source: hasKey() ? 'live' : 'mock',
      sourceLabel: hasKey() ? 'GEMINI LIVE' : '劇本 MOCK',
    }));
    ws = createWorkspace(el.querySelector('.awork') as HTMLElement);
    // Task 7 在此接 chat 控制器（#aForm submit / #aStop / mchip 導覽點擊）
  },
  async show() {
    if (booted) { if (lastDiag) ws.showDiag(lastDiag, false); return; } // 重入顯示上次終態
    booted = true;
    lastDiag = await runDiagnostics(ctxRef);
    ws.showDiag(lastDiag, !prefersReduced());
    greet(lastDiag); // 招呼泡泡 + 3 條建議指令 chips（模板組字：問候+健檢結論+LIVE/MOCK 統計）
  },
  hide() { /* Task 7 接 abort */ },
};
export default screen;

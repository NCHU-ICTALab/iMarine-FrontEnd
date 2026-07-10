/* 數位員工工作區（右欄 .awork）純 DOM 渲染層 — 不含業務邏輯，狀態一律由呼叫端（本 task 的
   index.ts 開場巡檢、Task 7 的 chat 控制器）透過下方 Workspace 介面推送。三態畫面（開場巡檢燈號牆／
   執行中結果卡堆疊／收尾足跡+確認卡）皆在此渲染。視覺基準：
   .superpowers/brainstorm/7098-1783649515/content/layout-v2.html。 */
import type { AgentModule, DiagReport, DiagModuleReport } from '../../data/types';
import { AGENT_MODULES } from './tools';

export interface ToolCardEvent {
  tool: string;
  summaryHtml: string;
  module?: AgentModule;
  ms?: number;
}

export interface Workspace {
  showDiag(rep: DiagReport, animate: boolean): void; // 6+1 燈號牆（逐卡點燈）
  pushToolCard(ev: ToolCardEvent, running: boolean): void; // 結果卡堆疊
  settleToolCard(summaryHtml: string, ms: number): void; // 當前卡由 running 轉完成
  showConfirm(summaryHtml: string): void; // 右欄同步顯示確認明細
  caption(text: string): void; // 底部旁白字幕
  footprint(modules: AgentModule[]): void; // done 後足跡 chips
  reset(): void;
}

type ModMeta = { id: AgentModule | 'settings'; name: string; color: string };
const SETTINGS_META: ModMeta = { id: 'settings', name: '系統設定', color: '#9FB0C0' };
const LAMP_ORDER: ModMeta[] = [...AGENT_MODULES, SETTINGS_META];
const MAX_VISIBLE_CARDS = 4;
const LAMP_STAGGER_MS = 80;

const STATUS_LABEL: Record<DiagModuleReport['status'], string> = {
  ok: 'LIVE', mock: 'MOCK', degraded: '異常', down: '離線',
};

interface CardState {
  tool: string;
  summaryHtml: string;
  module?: AgentModule;
  ms?: number;
  running: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function moduleMeta(id?: AgentModule): ModMeta | undefined {
  return id ? LAMP_ORDER.find((m) => m.id === id) : undefined;
}

export function createWorkspace(el: HTMLElement): Workspace {
  const titleEl = el.querySelector('#aWtitle') as HTMLElement;
  const bodyEl = el.querySelector('#aWbody') as HTMLElement;
  const capEl = el.querySelector('#aCaption') as HTMLElement;

  let cards: CardState[] = [];
  let confirmHtml: string | null = null;
  let footprintMods: AgentModule[] = [];

  function lampCardHtml(m: ModMeta, rep: DiagModuleReport): string {
    const badgeCls = rep.status === 'ok' || rep.status === 'degraded' || rep.status === 'down' ? rep.status : '';
    // rep.detail 已是 runDiagnostics() 組好的完整可讀句子（含 ms 時已內嵌，見 diagnostics.ts 的
    // probe()），不可再疊加 rep.latencyMs，否則 ok 狀態會重複顯示兩次 ms（曾實測screenshot 抓到）。
    return (
      `<div class="lampcard lg lg-static" style="--mc:${m.color}">` +
      `<div class="lamphead"><span class="dot"></span>${m.name}<span class="lampbadge ${badgeCls}">${STATUS_LABEL[rep.status]}</span></div>` +
      `<div class="lampdetail">${esc(rep.detail)}</div>` +
      '</div>'
    );
  }

  function diagCaption(rep: DiagReport): string {
    const bad = Object.values(rep.modules).filter((m) => m.status === 'down' || m.status === 'degraded');
    return bad.length ? `巡檢完成 · 發現 ${bad.length} 項異常` : '巡檢完成 · 全系統就緒';
  }

  function showDiag(rep: DiagReport, animate: boolean): void {
    titleEl.textContent = '生態系脈搏 — 巡檢燈號牆';
    bodyEl.innerHTML = `<div class="lampwall">${LAMP_ORDER.map((m) => lampCardHtml(m, rep.modules[m.id])).join('')}</div>`;
    const lamps = Array.from(bodyEl.querySelectorAll<HTMLElement>('.lampcard'));
    if (!animate) {
      lamps.forEach((n) => n.classList.add('lit'));
      capEl.textContent = diagCaption(rep);
      return;
    }
    capEl.textContent = '巡檢中…';
    lamps.forEach((n, i) => window.setTimeout(() => n.classList.add('lit'), i * LAMP_STAGGER_MS));
    window.setTimeout(() => { capEl.textContent = diagCaption(rep); }, lamps.length * LAMP_STAGGER_MS + 160);
  }

  function cardHtml(c: CardState): string {
    const meta = moduleMeta(c.module);
    const mc = meta ? meta.color : '#B48CFF';
    const dot = meta ? '<span class="dot"></span>' : '';
    const label = meta ? `${meta.name} · ${esc(c.tool)}` : esc(c.tool);
    const spin = c.running ? '<span class="spin">◌</span>' : '';
    const ms = c.ms !== undefined ? `<span class="wms">${c.ms}ms</span>` : '';
    const cls = 'wcard lg lg-static' + (c.running ? ' current' : ' settled');
    return (
      `<div class="${cls}" style="--mc:${mc}">` +
      `<h5>${dot}${label}${spin}${ms}</h5>` +
      `<div class="wsum">${c.summaryHtml}</div>` +
      '</div>'
    );
  }

  function footprintHtml(): string {
    if (!footprintMods.length) return '';
    const chips = footprintMods.map((id) => {
      const meta = moduleMeta(id);
      return `<span class="fchip" style="--mc:${meta?.color ?? '#B48CFF'}"><i></i>${meta?.name ?? id}<span class="fck">✓</span></span>`;
    }).join('');
    return `<div class="wfoot">${chips}</div>`;
  }

  function renderCards(): void {
    titleEl.textContent = '數位員工工作區';
    if (!cards.length && !confirmHtml && !footprintMods.length) {
      bodyEl.innerHTML = '<div class="widle">尚無操作記錄 — 由左側對話開始任務</div>';
      return;
    }
    const visible = cards.slice(-MAX_VISIBLE_CARDS);
    const folded = cards.length - visible.length;
    const foldHtml = folded > 0 ? `<div class="wfold"><span class="dot"></span>已收合 ${folded} 個較早步驟</div>` : '';
    const confirmBlock = confirmHtml
      ? `<div class="confirmcard"><div class="cstt">需要你確認</div><div class="csum">${confirmHtml}</div></div>`
      : '';
    bodyEl.innerHTML = footprintHtml() + confirmBlock +
      (cards.length ? `<div class="wstack">${foldHtml}${visible.map(cardHtml).join('')}</div>` : '');
  }

  function pushToolCard(ev: ToolCardEvent, running: boolean): void {
    cards.push({ tool: ev.tool, summaryHtml: ev.summaryHtml, module: ev.module, ms: ev.ms, running });
    renderCards();
  }

  function settleToolCard(summaryHtml: string, ms: number): void {
    const last = cards[cards.length - 1];
    if (!last) return;
    last.summaryHtml = summaryHtml;
    last.ms = ms;
    last.running = false;
    renderCards();
  }

  function showConfirm(summaryHtml: string): void {
    confirmHtml = summaryHtml;
    renderCards();
  }

  function caption(text: string): void {
    capEl.textContent = text;
  }

  function footprint(modules: AgentModule[]): void {
    footprintMods = modules;
    renderCards();
  }

  function reset(): void {
    cards = [];
    confirmHtml = null;
    footprintMods = [];
    renderCards();
    capEl.textContent = '系統就緒';
  }

  return { showDiag, pushToolCard, settleToolCard, showConfirm, caption, footprint, reset };
}

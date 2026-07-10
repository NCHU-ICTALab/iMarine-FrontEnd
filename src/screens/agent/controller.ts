/* 數位員工 chat 控制器（spec Task 7）— 把 replay/loop 的 AgentEvent 事件流接成可互動對話。
   狀態機：idle → running →（waiting_confirm）→ running → idle；running 中不可重入
   （送出鈕→停止鈕）；中斷統一走 AbortController。事件渲染見 consume() 對照表。
   雙態分派：hasKey() → runGemini（live）；否則 runScenario（劇本 mock）。
   導航走 hash（#/<id>，router.ts:110 hashchange 監聽）：navigate_to_screen 工具排程 pendingNav，
   任務 done 且未 abort → 1.5s 後跳轉；手動切頁/中斷會取消排程（teardown）。 */
import type { ScreenCtx } from '../types';
import type { AgentEvent, AgentModule, AgentScenario, DiagReport } from '../../data/types';
import type { Workspace } from './workspace';
import { runScenario, matchScenario, FALLBACK_EVENTS, type EngineIO } from './replay';
import { runGemini } from './loop';
import { createTools, renderAgentText, effectiveModule, AGENT_MODULES } from './tools';
import { prefersReduced } from '../settings/storage';
import scenariosJson from '../../data/mock/agent-scenarios.json';

const scenarios = scenariosJson as unknown as AgentScenario[];
const env = (import.meta as any).env ?? {};
const hasKey = () => !!env.VITE_GEMINI_API_KEY;

/* tool name → 旁白友善字（caption「正在呼叫 …」與時間軸 chip 用） */
const TOOL_LABEL: Record<string, string> = {
  get_module_data: '模組資料查詢', ask_policy_rag: '政策知識庫',
  run_diagnostics: '系統健檢', search_runbook: '維運知識庫',
  navigate_to_screen: '頁面導覽', place_carbon_order: '碳權掛單', update_setting: '設定更新',
};
const moduleName = (id: AgentModule): string => AGENT_MODULES.find((m) => m.id === id)?.name ?? id;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface AgentController {
  submit(text: string): boolean; // true = 任務已啟動；false = running 中被擋下（呼叫端可用來判斷是否消耗一次性 UI，如建議 chip）
  stop(): void;
  teardown(): void; // hide()：abort 進行中的任務 + 取消跳轉排程
}

export function createController(deps: {
  section: HTMLElement;
  ctx: ScreenCtx;
  ws: Workspace;
  onDiag(rep: DiagReport): void; // run_diagnostics 附載 → 更新 index 的 lastDiag + 重繪燈號牆
}): AgentController {
  const { section, ctx, ws } = deps;
  const thread = section.querySelector('#aThread') as HTMLElement;
  const form = section.querySelector('#aForm') as HTMLFormElement;
  const input = section.querySelector('#aInput') as HTMLInputElement;
  const sendBtn = section.querySelector('#aSend') as HTMLButtonElement;
  const stopBtn = section.querySelector('#aStop') as HTMLButtonElement;

  const tip = document.createElement('div'); // citation chip hover tooltip
  tip.className = 'mtip hidden';
  section.appendChild(tip);

  // ── 控制器狀態機 ──
  let running = false;
  let ctrl: AbortController | null = null;
  let confirmResolve: ((ok: boolean) => void) | null = null;
  let pendingNav: string | null = null;
  let navTimer: ReturnType<typeof setTimeout> | null = null;
  const history: unknown[] = []; // Gemini Content[]（live 多輪追問）
  const tools = createTools(ctx, { scheduleNav: (id) => { pendingNav = id; } });
  const lastToolSummary = new Map<AgentModule, string>(); // 各模組最近一張工具卡摘要（tooltip 用）

  // ── 每個任務期間的 consume 狀態（單任務、無重入；submit 開頭重置）──
  let curStep = -1;             // 目前 running 的步驟 index（tool_call chip 掛在此步）
  let textBuf = '';             // 累積的回答文字（每次 delta 重算整段 → citation 標記不被切半）
  let inflightCard = false;     // in-flight tool 是否推了右欄工具卡（tool_result 才 settle）
  let inflightDiag = false;     // in-flight tool 是否為 run_diagnostics（走燈號牆、不推卡）
  let lastChip: HTMLElement | null = null; // 當前步驟最後一顆工具 chip（tool_result 標耗時）
  let curBubble: HTMLElement | null = null;
  let thinking: HTMLElement | null = null; // 思考氣泡（reduced 時不加）

  const scrollThread = () => { thread.scrollTop = thread.scrollHeight; };

  function setIco(ico: Element | null, state: 'ok' | 'run' | 'pend'): void {
    if (!ico) return;
    ico.className = 'ico ' + state;
    ico.textContent = state === 'ok' ? '✓' : state === 'run' ? '◌' : '○';
  }

  function setInputMode(mode: 'running' | 'idle'): void {
    if (mode === 'running') {
      sendBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
    } else {
      stopBtn.classList.add('hidden');
      sendBtn.classList.remove('hidden');
      input.focus();
    }
  }

  function appendUserBubble(text: string): void {
    const b = document.createElement('div');
    b.className = 'bub-u anim';
    b.style.setProperty('--d', '0s');
    b.textContent = text;
    thread.appendChild(b);
    scrollThread();
  }

  function appendAgentBubble(): HTMLElement {
    const b = document.createElement('div');
    b.className = 'bub-a anim';
    b.style.setProperty('--d', '0s');
    b.innerHTML =
      '<div class="stt hidden"></div>' +
      '<div class="atline"></div>' +
      '<div class="atext"></div>' +
      '<div class="confirmhost"></div>';
    if (!prefersReduced()) {
      thinking = document.createElement('div');
      thinking.className = 'athink';
      thinking.innerHTML = '數位員工思考中<span class="dots"><i></i><i></i><i></i></span>';
      b.appendChild(thinking);
    }
    thread.appendChild(b);
    scrollThread();
    return b;
  }

  // ── 時間軸（plan-then-act）──
  function markStep(tline: HTMLElement, index: number, caption: string): void {
    tline.querySelectorAll<HTMLElement>('.tstep').forEach((row) => {
      if (Number(row.dataset.step) < index) setIco(row.querySelector('.ico'), 'ok');
    });
    let row = tline.querySelector<HTMLElement>(`.tstep[data-step="${index}"]`);
    if (!row) {
      // live 態步數可能多於 plan（或無 plan）→ 即時補一列，用 caption 當步名
      row = document.createElement('div');
      row.className = 'tstep';
      row.dataset.step = String(index);
      row.innerHTML = '<span class="ico pend">○</span><b></b><span class="tchips"></span>';
      tline.appendChild(row);
    }
    const label = row.querySelector('b') as HTMLElement;
    if (!label.textContent) label.textContent = caption;
    setIco(row.querySelector('.ico'), 'run');
  }

  function appendToolChip(row: HTMLElement, tool: string): HTMLElement {
    const chips = row.querySelector('.tchips') as HTMLElement;
    const c = document.createElement('span');
    c.className = 'tchip';
    c.textContent = TOOL_LABEL[tool] ?? tool;
    chips.appendChild(c);
    return c;
  }

  function finishSteps(tline: HTMLElement): void {
    tline.querySelectorAll('.tstep .ico.run').forEach((ico) => setIco(ico, 'ok'));
  }

  // ── consume(ev)：事件 → chat 左欄泡泡 + 右欄工作區（brief Step 3 對照表）──
  function consume(ev: AgentEvent, bubble: HTMLElement, touched: AgentModule[]): void {
    if (thinking) { thinking.remove(); thinking = null; }
    const tline = bubble.querySelector('.atline') as HTMLElement;
    const atext = bubble.querySelector('.atext') as HTMLElement;
    const stt = bubble.querySelector('.stt') as HTMLElement;

    switch (ev.kind) {
      case 'plan':
        stt.textContent = `執行計畫 ${ev.steps.length} 步`;
        stt.classList.remove('hidden');
        tline.innerHTML = ev.steps.map((s, i) =>
          `<div class="tstep" data-step="${i}"><span class="ico pend">○</span><b>${esc(s)}</b><span class="tchips"></span></div>`
        ).join('');
        curStep = -1;
        break;

      case 'step_start':
        markStep(tline, ev.index, ev.caption);
        curStep = ev.index;
        ws.caption(ev.caption);
        break;

      case 'tool_call': {
        const row = tline.querySelector<HTMLElement>(`.tstep[data-step="${curStep}"]`);
        lastChip = row ? appendToolChip(row, ev.tool) : null;
        inflightDiag = ev.tool === 'run_diagnostics';
        // live 態 get_module_data 的 tool_call 事件不帶靜態 module（讀任一模組），
        // effectiveModule 從 args.module 補齊；mock 態 ev.module 已由劇本帶入、原值短路不變。
        const evMod = effectiveModule(ev.tool, ev.args, ev.module);
        inflightCard = !!evMod; // 只有帶模組的工具（模組操作）才進右欄卡堆；run_diagnostics 走燈號牆
        if (inflightCard) ws.pushToolCard({ tool: ev.tool, summaryHtml: '呼叫中…', module: evMod }, true);
        ws.caption('正在呼叫 ' + (TOOL_LABEL[ev.tool] ?? ev.tool));
        if (evMod && !touched.includes(evMod)) touched.push(evMod);
        break;
      }

      case 'tool_result':
        if (lastChip) { lastChip.textContent += ` · ${ev.ms}ms`; lastChip = null; }
        if (inflightDiag) {
          inflightDiag = false; // 燈號牆已由 io.runTool→onDiag 重繪
          ws.caption('健檢完成');
        } else if (inflightCard) {
          inflightCard = false;
          if (ev.module) lastToolSummary.set(ev.module, ev.summaryHtml);
          ws.settleToolCard(ev.summaryHtml, ev.ms);
        }
        break;

      case 'text_delta':
        textBuf += ev.text;
        atext.innerHTML = renderAgentText(textBuf); // 整段重算：{{m:..}} 標記不被 chunk 切半
        break;

      case 'confirm_request':
        // 互動確認卡由 io.waitConfirm 渲染（需 resolve 回呼），此處刻意 no-op 避免雙渲染
        break;

      case 'done':
        finishSteps(tline);
        ws.caption('任務完成');
        break;

      case 'error': {
        const e = document.createElement('div');
        e.className = 'aerr';
        e.textContent = ev.message;
        bubble.appendChild(e);
        finishSteps(tline);
        ws.caption('發生錯誤');
        break;
      }
    }
    scrollThread();
  }

  // ── 確認卡（human-in-the-loop）：chat 泡泡內雙鈕；點擊或停止/切頁都走同一 pick ──
  function renderConfirmCard(
    bubble: HTMLElement,
    ev: Extract<AgentEvent, { kind: 'confirm_request' }>,
    resolve: (ok: boolean) => void,
  ): void {
    const host = bubble.querySelector('.confirmhost') as HTMLElement;
    const card = document.createElement('div');
    card.className = 'confirmcard chatconfirm';
    card.innerHTML =
      '<div class="cstt">需要你確認</div>' +
      `<div class="csum">${ev.summaryHtml}</div>` +
      '<div class="cbtns">' +
      '<button type="button" class="cbtn ok">確認執行</button>' +
      '<button type="button" class="cbtn no">取消</button>' +
      '</div>';
    host.appendChild(card);
    let settled = false;
    const pick = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      confirmResolve = null;
      card.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
      card.classList.add(ok ? 'picked-ok' : 'picked-no');
      ws.showConfirm(''); // 清右欄「需要你確認」明細（'' → renderCards 不渲染該區塊）
      resolve(ok);
    };
    (card.querySelector('.cbtn.ok') as HTMLButtonElement).addEventListener('click', () => pick(true));
    (card.querySelector('.cbtn.no') as HTMLButtonElement).addEventListener('click', () => pick(false));
    confirmResolve = pick; // 停止鈕 / teardown 走這裡（等同按「取消」）
    scrollThread();
  }

  // ── 任務生命週期 ──
  function submit(text: string): boolean {
    if (running || !text.trim()) return false;
    if (navTimer) { clearTimeout(navTimer); navTimer = null; } // 開新任務即取消上一個自動跳轉排程
    pendingNav = null;
    running = true;
    void runTask(text);
    return true;
  }

  async function runTask(text: string): Promise<void> {
    ctrl = new AbortController();
    setInputMode('running');
    appendUserBubble(text);
    const bubble = appendAgentBubble();
    curBubble = bubble;
    curStep = -1; textBuf = ''; inflightCard = false; inflightDiag = false; lastChip = null;
    lastToolSummary.clear(); // 新任務不留上一任務的 citation chip hover 摘要
    ws.reset();
    ws.caption('分析指令中…');

    const io: EngineIO = {
      reduced: prefersReduced(),
      signal: ctrl.signal,
      runTool: async (n, a) => {
        const tool = tools.find((t) => t.name === n);
        if (!tool) return { summaryHtml: `未知工具 ${esc(n)}`, llmText: `unknown tool ${n}` };
        const r = await tool.run(a);
        if (n === 'run_diagnostics' && r.data) deps.onDiag(r.data as DiagReport);
        return r;
      },
      waitConfirm: (ev) => new Promise<boolean>((res) => {
        renderConfirmCard(bubble, ev, res);
        ws.showConfirm(ev.summaryHtml);
        ws.caption('等待操作員確認…');
      }),
    };

    const gen = hasKey()
      ? runGemini({ apiKey: env.VITE_GEMINI_API_KEY, tools, history, userText: text, io })
      : runScenario(matchScenario(text, scenarios) ?? { id: 'fb', patterns: [], events: FALLBACK_EVENTS }, io);

    const touched: AgentModule[] = [];
    try {
      for await (const ev of gen) consume(ev, bubble, touched);
    } catch (err) {
      const e = document.createElement('div');
      e.className = 'aerr';
      e.textContent = '任務發生未預期錯誤：' + String((err as Error)?.message ?? err);
      bubble.appendChild(e);
    } finally {
      running = false;
      setInputMode('idle');
      if (touched.length) ws.footprint(touched); // 診斷型任務 touched=[]，不覆蓋燈號牆
      curBubble = null;
      if (pendingNav && ctrl && !ctrl.signal.aborted) {
        const target = pendingNav;
        pendingNav = null;
        navTimer = setTimeout(() => { navTimer = null; location.hash = '#/' + target; }, 1500);
      } else {
        pendingNav = null;
      }
    }
  }

  function stop(): void {
    if (!running) return;
    if (confirmResolve) confirmResolve(false); // 掛著的確認先當「取消」resolve，再 abort
    ctrl?.abort();
    if (curBubble) {
      curBubble.querySelectorAll('.tstep .ico.run').forEach((ic) => setIco(ic, 'pend')); // 停轉
      const note = document.createElement('div');
      note.className = 'astop';
      note.textContent = '已停止，前面步驟的結果保留。';
      curBubble.appendChild(note);
    }
    ws.caption('已停止');
    scrollThread();
  }

  function teardown(): void {
    if (running) {
      if (confirmResolve) confirmResolve(false);
      ctrl?.abort();
    }
    pendingNav = null;
    if (navTimer) { clearTimeout(navTimer); navTimer = null; }
    tip.classList.add('hidden');
  }

  function showTip(anchor: Element, htmlContent: string): void {
    tip.innerHTML = htmlContent;
    tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    let left = r.left;
    const maxLeft = window.innerWidth - tip.offsetWidth - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    tip.style.left = left + 'px';
    tip.style.top = r.bottom + 6 + 'px';
  }

  // ── 事件委派 + 輸入接線 ──
  form.addEventListener('submit', (e) => {
    e.preventDefault(); // Task 6 交接：無此 handler 會整頁 reload
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    void submit(t);
  });
  stopBtn.addEventListener('click', () => stop());

  // citation chip：click 跳頁（#/<id>）、hover 浮該模組最近工具卡摘要
  thread.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('[data-nav]');
    if (!chip) return;
    const id = chip.getAttribute('data-nav');
    if (id) location.hash = '#/' + id;
  });
  thread.addEventListener('mouseover', (e) => {
    const chip = (e.target as HTMLElement).closest('.mchip[data-nav]');
    if (!chip) return;
    const id = chip.getAttribute('data-nav') as AgentModule | null;
    const summary = (id && lastToolSummary.get(id)) || (id ? moduleName(id) : '');
    showTip(chip, summary);
  });
  thread.addEventListener('mouseout', (e) => {
    if ((e.target as HTMLElement).closest('.mchip[data-nav]')) tip.classList.add('hidden');
  });

  return { submit, stop, teardown };
}

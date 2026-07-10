/* 劇本 replay 引擎 — mock 態的 AgentEvent 產生器（spec §8）。
   與 loop.ts（live）共用 EngineIO 介面；exec:true 的 tool_call 真的執行工具（資料活的），
   回答文字預錄。reduced（prefers-reduced-motion / 設定）時跳過 delay。 */
import type { AgentEvent, AgentScenario, ScenarioEvent } from '../../data/types';
import type { ToolRunResult } from './tools';

export interface EngineIO {
  runTool(name: string, args: Record<string, unknown>): Promise<ToolRunResult>;
  waitConfirm(ev: Extract<AgentEvent, { kind: 'confirm_request' }>): Promise<boolean>;
  signal: AbortSignal;
  reduced: boolean;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res) => {
    if (signal.aborted) return res();
    const t = setTimeout(res, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });

/* 剝掉劇本專用欄位，回純 AgentEvent（UI 不該看到 delayMs/exec） */
function strip(ev: ScenarioEvent): AgentEvent {
  const { delayMs: _d, exec: _e, ...rest } = ev as ScenarioEvent & Record<string, unknown>;
  return rest as AgentEvent;
}

async function* play(events: ScenarioEvent[], cancelEvents: ScenarioEvent[] | undefined, io: EngineIO): AsyncGenerator<AgentEvent> {
  for (const ev of events) {
    if (io.signal.aborted) return;
    if (!io.reduced && ev.delayMs) await sleep(ev.delayMs, io.signal);
    if (io.signal.aborted) return;

    if (ev.kind === 'tool_call' && ev.exec) {
      yield strip(ev);
      const t0 = performance.now();
      const r = await io.runTool(ev.tool, ev.args);
      if (io.signal.aborted) return;
      yield { kind: 'tool_result', tool: ev.tool, summaryHtml: r.summaryHtml, module: r.module ?? (ev as any).module, ms: Math.round(performance.now() - t0) };
      continue;
    }
    if (ev.kind === 'confirm_request') {
      yield strip(ev);
      const ok = await io.waitConfirm(strip(ev) as Extract<AgentEvent, { kind: 'confirm_request' }>);
      if (io.signal.aborted) return;
      if (!ok) { yield* play(cancelEvents ?? [{ kind: 'done', delayMs: 0 }], undefined, io); return; }
      continue;
    }
    yield strip(ev);
    if (ev.kind === 'done') return;
  }
}

export function runScenario(sc: AgentScenario, io: EngineIO): AsyncGenerator<AgentEvent> {
  return play(sc.events, sc.cancelEvents, io);
}

export function matchScenario(input: string, scs: AgentScenario[]): AgentScenario | null {
  const s = input.toLowerCase();
  return scs.find((sc) => sc.patterns.some((p) => s.includes(p.toLowerCase()))) ?? null;
}

/* 比對不中：誠實示範說明（沿用 policy 自由輸入慣例） */
export const FALLBACK_EVENTS: ScenarioEvent[] = [
  { kind: 'text_delta', delayMs: 300, text: '目前為劇本示範模式（未偵測到 Gemini API key），只能回應預錄指令：試試「今日營運摘要」「紅海事件對碳成本的影響」「系統健檢」「幫我掛單碳權」。' },
  { kind: 'done', delayMs: 200 },
];

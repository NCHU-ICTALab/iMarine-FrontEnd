import { describe, expect, it } from 'vitest';
import { matchScenario, runScenario } from '../src/screens/agent/replay';
import type { AgentScenario } from '../src/data/types';

const sc: AgentScenario = {
  id: 't', patterns: ['健檢'],
  events: [
    { kind: 'plan', steps: ['a'], delayMs: 0 },
    { kind: 'tool_call', tool: 'run_diagnostics', args: {}, delayMs: 0, exec: true },
    { kind: 'confirm_request', tool: 'place_carbon_order', args: { qty: 1 }, summaryHtml: 'x', delayMs: 0 },
    { kind: 'tool_call', tool: 'place_carbon_order', args: { qty: 1 }, delayMs: 0, exec: true },
    { kind: 'text_delta', text: 'ok', delayMs: 0 },
    { kind: 'done', delayMs: 0 },
  ],
  cancelEvents: [{ kind: 'text_delta', text: '已取消', delayMs: 0 }, { kind: 'done', delayMs: 0 }],
};
const io = (confirm: boolean, ran: string[]): any => ({
  reduced: true, signal: new AbortController().signal,
  runTool: async (n: string) => { ran.push(n); return { summaryHtml: 's', llmText: 'l' }; },
  waitConfirm: async () => confirm,
});
async function collect(gen: AsyncGenerator<any>) { const out = []; for await (const e of gen) out.push(e); return out; }

describe('runScenario', () => {
  it('exec tool_call 真的執行工具並自動補 tool_result 事件', async () => {
    const ran: string[] = [];
    const evs = await collect(runScenario(sc, io(true, ran)));
    expect(ran).toEqual(['run_diagnostics', 'place_carbon_order']);
    expect(evs.filter((e) => e.kind === 'tool_result').length).toBe(2);
    expect(evs[evs.length - 1].kind).toBe('done');
  });
  it('confirm 取消 → 改播 cancelEvents、後續事件不執行', async () => {
    const ran: string[] = [];
    const evs = await collect(runScenario(sc, io(false, ran)));
    expect(ran).toEqual(['run_diagnostics']); // 掛單未執行
    expect(evs.some((e) => e.kind === 'text_delta' && e.text === '已取消')).toBe(true);
    expect(evs[evs.length - 1].kind).toBe('done');
  });
  it('abort → generator 提早結束、不再執行工具', async () => {
    const ctrl = new AbortController();
    const ran: string[] = [];
    const myIo = { ...io(true, ran), signal: ctrl.signal };
    const gen = runScenario(sc, myIo);
    await gen.next(); // plan
    ctrl.abort();
    const rest = await collect(gen);
    expect(ran).toEqual([]);
    expect(rest.length).toBe(0);
  });
});

describe('matchScenario', () => {
  it('關鍵字 includes 命中；不中回 null', () => {
    expect(matchScenario('幫我跑健檢', [sc])!.id).toBe('t');
    expect(matchScenario('毫無關聯', [sc])).toBeNull();
  });
});

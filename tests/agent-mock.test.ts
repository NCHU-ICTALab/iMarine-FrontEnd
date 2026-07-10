import { describe, expect, it } from 'vitest';
import scenarios from '../src/data/mock/agent-scenarios.json';
import runbook from '../src/data/mock/agent-runbook.json';
import type { AgentScenario, RunbookEntry } from '../src/data/types';

const SCS = scenarios as AgentScenario[];
const RBS = runbook as RunbookEntry[];
const KINDS = ['plan','step_start','tool_call','tool_result','text_delta','confirm_request','done','error'];
const TOOLS = ['get_module_data','ask_policy_rag','run_diagnostics','search_runbook','navigate_to_screen','place_carbon_order','update_setting'];

describe('agent-scenarios 契約', () => {
  it('4 條劇本、patterns 非空、事件 kind 合法、每條以 done 結尾', () => {
    expect(SCS.length).toBe(4);
    for (const sc of SCS) {
      expect(sc.patterns.length).toBeGreaterThan(0);
      for (const ev of sc.events) expect(KINDS).toContain(ev.kind);
      expect(sc.events[sc.events.length - 1].kind).toBe('done');
      if (sc.cancelEvents) expect(sc.cancelEvents[sc.cancelEvents.length - 1].kind).toBe('done');
    }
  });
  it('exec 的 tool_call 只用已定義工具；confirm_request 後必有同名 exec tool_call', () => {
    for (const sc of SCS) {
      sc.events.forEach((ev, i) => {
        if (ev.kind === 'tool_call' && ev.exec) expect(TOOLS).toContain(ev.tool);
        if (ev.kind === 'confirm_request') {
          const next = sc.events.slice(i + 1).find((e) => e.kind === 'tool_call');
          expect(next && next.kind === 'tool_call' && next.tool === ev.tool).toBe(true);
          expect(sc.cancelEvents?.length).toBeGreaterThan(0);
        }
      });
    }
  });
  it('text_delta 的 {{m:xxx}} 標記只引用六模組', () => {
    for (const sc of SCS) for (const ev of sc.events) {
      if (ev.kind !== 'text_delta') continue;
      for (const m of ev.text.matchAll(/\{\{m:(\w+)\}\}/g))
        expect(['carbon','policy','twin','dispatch','epidemic','alert']).toContain(m[1]);
    }
  });
});

describe('agent-runbook 契約', () => {
  it('8 條、id 唯一、fix 非空', () => {
    expect(RBS.length).toBe(8);
    expect(new Set(RBS.map((r) => r.id)).size).toBe(8);
    for (const r of RBS) expect(r.fix.length).toBeGreaterThan(0);
  });
});

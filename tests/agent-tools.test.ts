import { describe, expect, it } from 'vitest';
import { AGENT_MODULES, SETTING_WHITELIST, createTools, renderAgentText } from '../src/screens/agent/tools';

describe('renderAgentText', () => {
  it('{{m:carbon}} 轉成帶模組色與 data-nav 的 chip、其餘文字 escape', () => {
    const html = renderAgentText('碳權上漲{{m:carbon}} <b>不執行</b>\n次行');
    expect(html).toContain('data-nav="carbon"');
    expect(html).toContain('--mc:#E9BC63');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('<br>');
  });
  it('未知模組標記整段移除', () => {
    expect(renderAgentText('x{{m:nope}}y')).toBe('xy');
  });
});

describe('createTools', () => {
  const mock = { source: 'mock', snapshot: async () => ({ kpi: { published: 3 } }) };
  const ctx: any = { data: {
    carbon: { source: 'live', base: 'http://c', snapshot: async () => ({ ok: false, issued: 0, tonsCirculating: 0, listed: 0, retired: 0 }) },
    policy: { source: 'live', snapshot: async () => ({}), chat: async () => { throw new Error('down'); } },
    twin: { source: 'live', snapshot: async () => ({ berths: [], trackCount: 443 }) },
    overview: mock, dispatch: mock, epidemic: mock, alert: mock,
  } };
  const tools = createTools(ctx, { scheduleNav: () => {} });
  const by = (n: string) => tools.find((t) => t.name === n)!;

  it('七工具齊備；寫工具標 confirm', () => {
    expect(tools.map((t) => t.name).sort()).toEqual([
      'ask_policy_rag','get_module_data','navigate_to_screen',
      'place_carbon_order','run_diagnostics','search_runbook','update_setting'].sort());
    expect(by('place_carbon_order').confirm).toBe(true);
    expect(by('update_setting').confirm).toBe(true);
  });
  it('get_module_data(carbon) 後端離線 → llmText 標示離線、不把零值當真', async () => {
    const r = await by('get_module_data').run({ module: 'carbon' });
    expect(r.llmText).toContain('離線');
    expect(r.module).toBe('carbon');
  });
  it('ask_policy_rag 後端不在 → 退示範罐頭（訊息帶「示範」）', async () => {
    const r = await by('ask_policy_rag').run({ question: 'x' });
    expect(r.llmText).toContain('示範');
  });
  it('search_runbook 關鍵字命中', async () => {
    const r = await by('search_runbook').run({ symptom: '碳權後端離線' });
    expect(r.llmText).toContain('make chain');
  });
  it('update_setting 白名單外 key 拒絕', async () => {
    const r = await by('update_setting').run({ key: 'evil.key', value: 1 });
    expect(r.llmText).toContain('不在允許');
    expect(SETTING_WHITELIST.length).toBeGreaterThan(0);
  });
});

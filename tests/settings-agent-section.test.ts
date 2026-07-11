import { describe, it, expect } from 'vitest';
import { agentSection } from '../src/screens/settings/sections/agent';

const allFields = () => agentSection.groups.flatMap((g) => g.fields ?? []);

describe('settings agent section 契約', () => {
  it('分區 id/色彩', () => {
    expect(agentSection.id).toBe('agent');
    expect(agentSection.color).toBe('#B48CFF');
  });
  it('geminiKey 為 password kind', () => {
    const f = allFields().find((x) => 'key' in x && x.key === 'agent.geminiKey');
    expect(f?.kind).toBe('password');
  });
  it('model 為 select、預設 flash 為第一選項、共三選項', () => {
    const f = allFields().find((x) => 'key' in x && x.key === 'agent.model');
    expect(f?.kind).toBe('select');
    const opts = (f as { options: () => { value: string }[] }).options();
    expect(opts.map((o) => o.value)).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']);
  });
  it('sourceMode 為 select（auto/mock）', () => {
    const f = allFields().find((x) => 'key' in x && x.key === 'agent.sourceMode');
    expect(f?.kind).toBe('select');
    const opts = (f as { options: () => { value: string }[] }).options();
    expect(opts.map((o) => o.value)).toEqual(['auto', 'mock']);
  });
  it('autoPatrol 為 toggle 且 defaultOn', () => {
    const f = allFields().find((x) => 'key' in x && x.key === 'agent.autoPatrol');
    expect(f?.kind).toBe('toggle');
    expect((f as { defaultOn?: boolean }).defaultOn).toBe(true);
  });
});

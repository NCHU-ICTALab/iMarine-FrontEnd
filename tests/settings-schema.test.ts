import { describe, it, expect } from 'vitest';
import { validateSections, type SettingsSection } from '../src/screens/settings/schema';

const sec = (id: string, keys: string[]): SettingsSection => ({
  id, label: id, color: '#9FB0C0', status: () => '',
  groups: [{ title: 'g', saveMode: 'instant',
    fields: keys.map((k) => ({ kind: 'toggle' as const, key: k, label: k })) }],
});

describe('settings schema', () => {
  it('key 全域唯一：合法通過', () => {
    expect(() => validateSections([sec('a', ['a.x']), sec('b', ['b.x'])])).not.toThrow();
  });
  it('key 重複：throw 且訊息含重複 key', () => {
    expect(() => validateSections([sec('a', ['dup.k']), sec('b', ['dup.k'])])).toThrow(/dup\.k/);
  });
});

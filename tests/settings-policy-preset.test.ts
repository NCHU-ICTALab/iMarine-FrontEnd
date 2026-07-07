import { describe, it, expect } from 'vitest';
import { PROVIDER_PRESET, KB_PRESET, DEFAULTS_PRESET } from '../src/screens/settings/sections/policy';

describe('policy 預置資料契約', () => {
  it('供應商：3 家預置、Ollama 已連線含三種 kind、雲端家帶 catalog', () => {
    expect(PROVIDER_PRESET).toHaveLength(3);
    const ollama = PROVIDER_PRESET.find((p) => p.id === 'ollama')!;
    expect(ollama.connected).toBe(true);
    expect(new Set(ollama.models.map((m) => m.kind))).toEqual(new Set(['chat', 'embedding', 'rerank']));
    PROVIDER_PRESET.filter((p) => !p.connected).forEach((p) => {
      expect(p.catalog && p.catalog.length).toBeTruthy();
    });
  });
  it('知識庫：五庫、文件數 12/9/7/8/6、每庫 chunk 與 retrieval 欄位齊全', () => {
    expect(KB_PRESET.map((k) => k.docs.length)).toEqual([12, 9, 7, 8, 6]);
    KB_PRESET.forEach((k) => {
      expect(k.chunk.size).toBeGreaterThan(0);
      expect(['vector', 'fulltext', 'hybrid']).toContain(k.retrieval.strategy);
      expect(typeof k.retrieval.rerank).toBe('boolean');
    });
  });
  it('預設模型：形狀為 reasoning/embedding/rerank 三欄字串', () => {
    expect(Object.keys(DEFAULTS_PRESET).sort()).toEqual(['embedding', 'reasoning', 'rerank']);
  });
});

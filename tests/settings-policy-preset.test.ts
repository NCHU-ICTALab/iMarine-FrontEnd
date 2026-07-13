import { describe, it, expect } from 'vitest';
import { PROVIDER_PRESET, KB_PRESET, DEFAULTS_PRESET, getProviders, getKbs, getDefaults } from '../src/screens/settings/sections/policy';

describe('policy 預置資料契約', () => {
  it('供應商：4 家預置、Ollama 已連線含三種 kind、雲端家帶 catalog、Gemini 預填 url', () => {
    expect(PROVIDER_PRESET).toHaveLength(4);
    const ollama = PROVIDER_PRESET.find((p) => p.id === 'ollama')!;
    expect(ollama.connected).toBe(true);
    expect(new Set(ollama.models.map((m) => m.kind))).toEqual(new Set(['chat', 'embedding', 'rerank']));
    PROVIDER_PRESET.filter((p) => !p.connected).forEach((p) => {
      expect(p.catalog && p.catalog.length).toBeTruthy();
    });
    // Gemini（OpenAI 相容）：url 固定不好記，故預填讓使用者只需貼 key
    const gemini = PROVIDER_PRESET.find((p) => p.id === 'gemini')!;
    expect(gemini.url).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(gemini.catalog!.some((m) => m.kind === 'chat')).toBe(true);
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
  it('狀態污染防護：空 storage 下 getters 回傳深拷貝、就地 mutate 不污染 export 常數', () => {
    // 空 storage（本測試檔全程不 setSetting policy.providers/policy.kbs）下，getter 的 fallback
    // 必須是 PRESET 的深拷貝而非同一參照——否則消費端就地 push/覆寫會污染 export 常數。
    const provs = getProviders();
    const kbs = getKbs();
    const defaults = getDefaults();
    expect(provs).not.toBe(PROVIDER_PRESET);
    expect(kbs).not.toBe(KB_PRESET);
    expect(defaults).not.toBe(DEFAULTS_PRESET);

    const provLenBefore = PROVIDER_PRESET.length;
    const kbFirstDocsBefore = KB_PRESET[0].docs.length;
    const reasoningBefore = DEFAULTS_PRESET.reasoning;

    // 模擬 saveBtn 就地 push / 文件上傳就地 push / 系統預設模型 select 就地改
    provs.push({ ...provs[0], id: 'pollute-check' });
    kbs[0].docs.push({ id: 'pollute-doc', name: 'x.pdf', status: 'available' });
    defaults.reasoning = 'x';

    expect(PROVIDER_PRESET.length).toBe(provLenBefore);
    expect(KB_PRESET[0].docs.length).toBe(kbFirstDocsBefore);
    expect(DEFAULTS_PRESET.reasoning).toBe(reasoningBefore);
  });
});

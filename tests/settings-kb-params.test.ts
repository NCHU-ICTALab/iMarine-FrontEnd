import { describe, it, expect } from 'vitest';
import {
  defaultKbParams, getKbParams, setKbParams,
} from '../src/screens/settings/sections/policy-kb-mock';

describe('policy.kbParams（live 知識庫本機檢索參數，存而不用）', () => {
  it('無存值回 null；defaultKbParams 形狀正確', () => {
    expect(getKbParams('no_such_source')).toBeNull();
    const d = defaultKbParams();
    expect(d.chunk).toEqual({ size: 512, overlap: 64 });
    expect(d.retrieval.strategy).toBe('vector');
    expect(d.retrieval.hybridWeight).toBe(60);
    expect(d.retrieval.rerank).toBe(false);
  });

  it('round-trip：set 後 get 讀回，且不同 source_id 互不干擾', () => {
    const p = defaultKbParams();
    p.retrieval.strategy = 'hybrid';
    p.retrieval.hybridWeight = 75;
    p.chunk = { size: 1024, overlap: 128 };
    setKbParams('src_a', p);
    expect(getKbParams('src_a')).toEqual(p);
    expect(getKbParams('src_b')).toBeNull();
  });
});

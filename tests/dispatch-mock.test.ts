import { describe, it, expect } from 'vitest';
import { createMockExchange } from '../src/data/exchange/mock';

const OPS = ['crane', 'grain', 'coal', 'tanker', 'pilot', 'mooring', 'yard'];
const ST = ['ok', 'warn', 'stop'];
const RAIN = ['無', '小雨', '大雨', '豪雨', '大豪雨', '超大豪雨'];

describe('dispatch mock 契約', () => {
  it('3 情境（stable/rain/typhoon），每情境 7 種作業、順序固定', async () => {
    const s = await createMockExchange().dispatch.snapshot();
    expect(s.scenarios.map((x) => x.id)).toEqual(['stable', 'rain', 'typhoon']);
    for (const sc of s.scenarios) expect(sc.ops.map((o) => o.id)).toEqual(OPS);
  });
  it('燈號/雨量枚舉合法；CWA 固定 +3h/+6h 兩窗', async () => {
    const s = await createMockExchange().dispatch.snapshot();
    for (const sc of s.scenarios) {
      expect(RAIN).toContain(sc.nowcast.rainLevel);
      expect(sc.cwa.map((w) => w.window)).toEqual(['+3h', '+6h']);
      for (const w of sc.cwa) expect(RAIN).toContain(w.rainLevel);
      for (const o of sc.ops) {
        expect(ST).toContain(o.now.status);
        expect(ST).toContain(o.cwa3);
        expect(ST).toContain(o.cwa6);
        expect(o.rules.length).toBeGreaterThanOrEqual(1);
        for (const r of o.rules) expect(['official', 'industry']).toContain(r.tag);
      }
    }
  });
  it('卡片 2-5 張、opId 都存在於 ops；結論標記可解析無殘留', async () => {
    const s = await createMockExchange().dispatch.snapshot();
    for (const sc of s.scenarios) {
      expect(sc.cards.length).toBeGreaterThanOrEqual(2);
      expect(sc.cards.length).toBeLessThanOrEqual(5);
      for (const c of sc.cards) expect(OPS).toContain(c.opId);
      expect(sc.conclusion.replace(/\{\{(stop|add):[^}]*\}\}/g, '')).not.toContain('{{');
    }
  });
  it('主秀 rain 情境：crane/grain 停工、mooring 加派（warn）、+6h 全面恢復綠', async () => {
    const s = await createMockExchange().dispatch.snapshot();
    const rain = s.scenarios[1];
    expect(rain.ops.find((o) => o.id === 'crane')!.now.status).toBe('stop');
    expect(rain.ops.find((o) => o.id === 'grain')!.now.status).toBe('stop');
    expect(rain.ops.find((o) => o.id === 'mooring')!.now.status).toBe('warn');
    for (const o of rain.ops) expect(o.cwa6).toBe('ok');
  });
});

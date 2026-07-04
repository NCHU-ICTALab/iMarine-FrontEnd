import { describe, it, expect } from 'vitest';
import {
  fromMs, toMs, nowMs, peakInPort, occupancy, inPortAt, categoryCounts, fmtClock,
} from '../src/screens/twin/scene-init';
import { SHIP_CATEGORIES } from '../src/screens/twin/palette';
import type { ShipCategory } from '../src/screens/twin/palette';

describe('twin scene-init（模組層純資料）', () => {
  it('回放窗口為真實 24.2hr 錄製', () => {
    expect(toMs - fromMs).toBeGreaterThan(24 * 3600_000);
    expect(toMs - fromMs).toBeLessThan(25 * 3600_000);
    expect(nowMs).toBeGreaterThanOrEqual(fromMs);
    expect(nowMs).toBeLessThanOrEqual(toMs);
  });
  it('峰值時刻在港數 = 無篩選 inPortAt(nowMs)', () => {
    expect(inPortAt(nowMs)).toBe(peakInPort);
    expect(peakInPort).toBeGreaterThan(0);
  });
  it('篩選會單調減少在港數，且全類別=無篩選', () => {
    const all = new Set<ShipCategory>(SHIP_CATEGORIES);
    expect(inPortAt(nowMs, all)).toBe(inPortAt(nowMs));
    const none = new Set<ShipCategory>();
    expect(inPortAt(nowMs, none)).toBe(0);
    const onlyContainer = new Set<ShipCategory>(['貨櫃']);
    expect(inPortAt(nowMs, onlyContainer)).toBeLessThanOrEqual(inPortAt(nowMs));
  });
  it('categoryCounts 長度=10 且總和=航跡總數（每軌恰一類）', () => {
    const counts = categoryCounts();
    expect(counts).toHaveLength(SHIP_CATEGORIES.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(443);
  });
  it('occupancy 含 108-115 範圍的真實佔用區間', () => {
    expect(occupancy.length).toBeGreaterThan(0);
    expect(occupancy.some((it) => it.berthNo >= 108 && it.berthNo <= 115)).toBe(true);
  });
  it('fmtClock 輸出 MM/DD HH:mm', () => {
    expect(fmtClock(fromMs)).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});

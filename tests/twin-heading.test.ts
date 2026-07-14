// tests/twin-heading.test.ts
import { describe, it, expect } from 'vitest';
import {
  stabilizeTrackHeadings, headingAt, berthLockedAt,
  lerpAngleRad, aisDegToWorldRad, alignTangent,
} from '../src/screens/twin/time/heading';
import type { AisPathPoint } from '../src/screens/twin/data/ais';

// 測試投影：1 世界單位 = 1 公尺；lat/lon 直接當公尺用（North=-z, East=+x）
const toWorld = (lat: number, lon: number) => ({ x: lon, z: -lat });
const farPier = () => ({ headingRad: 0, distU: Infinity });
const OPTS = { toWorld, nearestPier: farPier, pierSnapMaxU: 150, worldScale: 1 };
const MIN = 60_000;
// path 建構器：[北向公尺, 東向公尺, 分鐘, hdgDeg]
const P = (n: number, e: number, min: number, hdg = -1): AisPathPoint => [n, e, min * MIN, hdg];

describe('twin heading 穩定化（純函式）', () => {
  it('aisDegToWorldRad：0°(北)→-π/2、90°(東)→0', () => {
    expect(aisDegToWorldRad(0)).toBeCloseTo(-Math.PI / 2, 6);
    expect(aisDegToWorldRad(90)).toBeCloseTo(0, 6);
  });
  it('lerpAngleRad 走最短弧（跨 ±π）', () => {
    expect(Math.cos(lerpAngleRad(Math.PI - 0.1, -Math.PI + 0.1, 0.5))).toBeCloseTo(-1, 6);
  });
  it('alignTangent：與參考夾角 >90° 時翻轉 180°', () => {
    expect(Math.cos(alignTangent(Math.PI, 0))).toBeCloseTo(1, 6);   // π vs 0 → 翻成 0(≡2π)
    expect(alignTangent(Math.PI / 6, 0)).toBeCloseTo(Math.PI / 6, 6); // 30° ≤ 90° → 保留
  });

  it('錨地抖動：停止段保持進來的航向（不再逐點亂轉）', () => {
    // 東行 60m/min(≈1.94kn) 3 段 → 之後 ±2m 抖動（0.02m/s，停止）
    const path = [
      P(0, 0, 0), P(0, 60, 1), P(0, 120, 2), P(0, 180, 3),
      P(2, 181, 4), P(-1, 179, 5), P(1, 182, 6), P(-2, 180, 7),
    ];
    const aux = stabilizeTrackHeadings(path, OPTS);
    // 進來航向 = 正東 = 世界 rad 0
    for (const min of [4, 4.5, 5, 6, 6.9]) {
      expect(headingAt(path, aux, min * MIN)).toBeCloseTo(0, 4);
    }
    expect(berthLockedAt(path, aux, 5 * MIN)).toBe(false); // 離碼頭遠 → 不鎖泊
  });

  it('近碼頭停止：鎖碼頭切線，且取不掉頭的方向', () => {
    // 進來正東(0)；碼頭切線給 π（無向）→ 應翻成 0
    const nearPier = () => ({ headingRad: Math.PI, distU: 50 });
    const path = [
      P(0, 0, 0), P(0, 60, 1), P(0, 120, 2),
      P(1, 121, 3), P(-1, 120, 4), P(0, 122, 5),
    ];
    const aux = stabilizeTrackHeadings(path, { ...OPTS, nearestPier: nearPier });
    expect(headingAt(path, aux, 4 * MIN)).toBeCloseTo(0, 4);
    expect(berthLockedAt(path, aux, 4 * MIN)).toBe(true);
    expect(berthLockedAt(path, aux, 0.5 * MIN)).toBe(false); // 移動段不鎖
  });

  it('移動段：AIS heading 優先，缺則點間方位角', () => {
    // 位移朝北（bearing 北 → 世界 -π/2），但 AIS hdg=90(東) → 應採 AIS → 0
    const withHdg = [P(0, 0, 0, 90), P(60, 0, 1, 90), P(120, 0, 2, 90)];
    const auxH = stabilizeTrackHeadings(withHdg, OPTS);
    expect(headingAt(withHdg, auxH, 1 * MIN)).toBeCloseTo(0, 4);
    const noHdg = [P(0, 0, 0), P(60, 0, 1), P(120, 0, 2)];
    const auxB = stabilizeTrackHeadings(noHdg, OPTS);
    expect(headingAt(noHdg, auxB, 1 * MIN)).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('開頭就停：回填第一段移動航向', () => {
    const path = [P(0, 0, 0), P(1, 1, 1), P(0, 0, 2), P(60, 0, 3), P(120, 0, 4)]; // 先抖 2 分鐘再北行
    const aux = stabilizeTrackHeadings(path, OPTS);
    expect(headingAt(path, aux, 0.5 * MIN)).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('確定性 + 範圍外 null', () => {
    const path = [P(0, 0, 0), P(0, 60, 1), P(1, 61, 2), P(0, 60, 3)];
    const aux = stabilizeTrackHeadings(path, OPTS);
    expect(headingAt(path, aux, 2.5 * MIN)).toBe(headingAt(path, aux, 2.5 * MIN));
    expect(headingAt(path, aux, -MIN)).toBeNull();
    expect(headingAt(path, aux, 10 * MIN)).toBeNull();
    expect(berthLockedAt(path, aux, 10 * MIN)).toBe(false);
  });
});

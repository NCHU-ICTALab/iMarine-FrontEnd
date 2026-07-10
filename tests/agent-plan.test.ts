import { describe, expect, it } from 'vitest';
import { parsePlan } from '../src/screens/agent/loop';

describe('parsePlan', () => {
  it('PLAN:: 前綴 → 拆步驟、rest 為剩餘文字', () => {
    const r = parsePlan('PLAN::讀資料｜查知識庫｜寫摘要\n開始執行');
    expect(r.steps).toEqual(['讀資料', '查知識庫', '寫摘要']);
    expect(r.rest).toBe('開始執行');
  });
  it('無前綴 → steps 空、rest 原文（UI 容忍 plan 缺席）', () => {
    const r = parsePlan('直接回答');
    expect(r.steps).toEqual([]);
    expect(r.rest).toBe('直接回答');
  });
});

import { describe, expect, it } from 'vitest';
import { parsePlan, parseSuggest, splitEmittable, friendlyError } from '../src/screens/agent/loop';

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

describe('parseSuggest', () => {
  it('尾行 SUGGEST:: → 拆 items、rest 去掉該行', () => {
    const r = parseSuggest('回答內容。\nSUGGEST::追問A｜追問B｜追問C');
    expect(r.items).toEqual(['追問A', '追問B', '追問C']);
    expect(r.rest).toBe('回答內容。');
  });
  it('帶尾端換行也解析；超過 3 條截斷', () => {
    const r = parseSuggest('x\nSUGGEST::a｜b｜c｜d\n');
    expect(r.items).toEqual(['a', 'b', 'c']);
  });
  it('無 SUGGEST → items 空、rest 原文', () => {
    expect(parseSuggest('純回答')).toEqual({ items: [], rest: '純回答' });
  });
});

describe('splitEmittable', () => {
  it('尾行是 SUGGEST 字首（切半）→ 扣住尾行、放行其餘', () => {
    expect(splitEmittable('回答。\nSUG')).toEqual({ emit: '回答。\n', hold: 'SUG' });
  });
  it('尾行是完整 SUGGEST 行 → 扣住', () => {
    const r = splitEmittable('回答。\nSUGGEST::a｜b');
    expect(r.hold).toBe('SUGGEST::a｜b');
  });
  it('尾行帶結尾換行的 SUGGEST 行 → 仍扣住（不外洩）', () => {
    const r = splitEmittable('回答。\nSUGGEST::a｜b\n');
    expect(r.emit).toBe('回答。\n');
    expect(r.hold).toBe('SUGGEST::a｜b\n');
  });
  it('一般文字尾行 → 全部放行', () => {
    expect(splitEmittable('回答還沒完')).toEqual({ emit: '回答還沒完', hold: '' });
  });
});

describe('friendlyError', () => {
  it('key 無效', () => { expect(friendlyError('API_KEY_INVALID: x').message).toContain('金鑰'); });
  it('網路', () => { expect(friendlyError('TypeError: Failed to fetch').message).toContain('網路'); });
  it('額度', () => { expect(friendlyError('429 RESOURCE_EXHAUSTED').message).toContain('額度'); });
  it('其他 → 通用 + detail 截 120', () => {
    const r = friendlyError('x'.repeat(300));
    expect(r.message).toContain('暫時無法回應');
    expect(r.detail!.length).toBe(120);
  });
});

import { describe, it, expect } from 'vitest';
import { checkFields, summarize, formatResults } from '../scripts/verify/lib.mjs';

describe('checkFields', () => {
  it('欄位齊且型別正確 → 空陣列', () => {
    expect(checkFields({ a: 'x', n: 1, b: true, arr: [], o: {} },
      { a: 'string', n: 'number', b: 'boolean', arr: 'array', o: 'object' })).toEqual([]);
  });
  it('缺必填欄位 → 報缺欄位', () => {
    expect(checkFields({}, { a: 'string' })).toEqual(['缺欄位 a']);
  });
  it('型別不符 → 報預期/實際', () => {
    expect(checkFields({ a: 1 }, { a: 'string' })).toEqual(['欄位 a 預期 string，得到 number']);
  });
  it('選填欄位（尾綴 ?）缺席不報錯、存在則驗型別', () => {
    expect(checkFields({}, { a: 'string?' })).toEqual([]);
    expect(checkFields({ a: 1 }, { a: 'string?' })).toEqual(['欄位 a 預期 string，得到 number']);
  });
  it('array 與 object 區分（Array 不算 object）', () => {
    expect(checkFields({ a: [] }, { a: 'object' })).toEqual(['欄位 a 預期 object，得到 array']);
  });
  it('null 欄位視為 null 型別', () => {
    expect(checkFields({ a: null }, { a: 'string' })).toEqual(['欄位 a 預期 string，得到 null']);
  });
  it('非物件輸入 → 單則錯誤', () => {
    expect(checkFields(null, { a: 'string' })).toEqual(['預期物件，得到 null']);
    expect(checkFields([], { a: 'string' })).toEqual(['預期物件，得到 array']);
  });
});

describe('summarize', () => {
  it('全過 → exitCode 0', () => {
    expect(summarize([{ name: 'a', ok: true }])).toEqual({ passed: 1, failed: 0, exitCode: 0 });
  });
  it('任一失敗 → exitCode 1', () => {
    expect(summarize([{ name: 'a', ok: true }, { name: 'b', ok: false }]))
      .toEqual({ passed: 1, failed: 1, exitCode: 1 });
  });
  it('空清單 → 全零', () => {
    expect(summarize([])).toEqual({ passed: 0, failed: 0, exitCode: 0 });
  });
});

describe('formatResults', () => {
  it('每項一行 PASS/FAIL，有 detail 加縮排行', () => {
    expect(formatResults([
      { name: 'x', ok: true },
      { name: 'y', ok: false, detail: '原因' },
    ])).toBe('PASS  x\nFAIL  y\n      原因');
  });
});

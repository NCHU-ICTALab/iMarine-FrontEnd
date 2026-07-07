import { describe, it, expect } from 'vitest';
import { getSetting, setSetting, subscribe, prefersReduced } from '../src/screens/settings/storage';

describe('settings storage', () => {
  it('round-trip：set 後 get 讀回、未設定回 fallback', () => {
    expect(getSetting('t.miss', 'dft')).toBe('dft');
    setSetting('t.a', 123);
    expect(getSetting('t.a', 0)).toBe(123);
    setSetting('t.obj', { x: [1, 2] });
    expect(getSetting<{ x: number[] }>('t.obj', { x: [] }).x).toEqual([1, 2]);
  });

  it('subscribe：setSetting 觸發回呼、解除後不再觸發', () => {
    const got: unknown[] = [];
    const off = subscribe('t.sub', (v) => got.push(v));
    setSetting('t.sub', 'one');
    off();
    setSetting('t.sub', 'two');
    expect(got).toEqual(['one']);
  });

  it('prefersReduced：settings 覆寫優先（node 無 matchMedia 時只看設定）', () => {
    setSetting('frontend.reduceMotion', false);
    expect(prefersReduced()).toBe(false);
    setSetting('frontend.reduceMotion', true);
    expect(prefersReduced()).toBe(true);
  });
});

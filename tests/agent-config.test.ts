import { describe, it, expect, beforeEach } from 'vitest';
import { setSetting } from '../src/screens/settings/storage';
import { effectiveKey, effectiveModel, isLive } from '../src/screens/agent/config';

// 每案重置相關 settings key（storage 在 node 退記憶體，跨案殘留要清）
beforeEach(() => {
  setSetting('agent.geminiKey', '');
  setSetting('agent.model', '');
  setSetting('agent.sourceMode', 'auto');
});

describe('effectiveKey', () => {
  it('settings 覆寫 env', () => {
    setSetting('agent.geminiKey', 'sk-from-settings');
    expect(effectiveKey({ VITE_GEMINI_API_KEY: 'sk-from-env' })).toBe('sk-from-settings');
  });
  it('settings 空 → 退 env', () => {
    expect(effectiveKey({ VITE_GEMINI_API_KEY: 'sk-from-env' })).toBe('sk-from-env');
  });
  it('兩者皆無 → 空字串', () => {
    expect(effectiveKey({})).toBe('');
  });
  it('settings 純空白視同空', () => {
    setSetting('agent.geminiKey', '   ');
    expect(effectiveKey({ VITE_GEMINI_API_KEY: 'sk-env' })).toBe('sk-env');
  });
});

describe('effectiveModel', () => {
  it('未設定 → 預設 gemini-2.5-flash', () => {
    expect(effectiveModel()).toBe('gemini-2.5-flash');
  });
  it('已設定 → 讀 settings', () => {
    setSetting('agent.model', 'gemini-2.5-pro');
    expect(effectiveModel()).toBe('gemini-2.5-pro');
  });
});

describe('isLive', () => {
  it('sourceMode=mock → 有 key 也 false', () => {
    setSetting('agent.sourceMode', 'mock');
    setSetting('agent.geminiKey', 'sk');
    expect(isLive({ VITE_GEMINI_API_KEY: 'sk-env' })).toBe(false);
  });
  it('auto + settings key → true', () => {
    setSetting('agent.geminiKey', 'sk');
    expect(isLive({})).toBe(true);
  });
  it('auto + 只有 env key → true', () => {
    expect(isLive({ VITE_GEMINI_API_KEY: 'sk-env' })).toBe(true);
  });
  it('auto + 無 key → false', () => {
    expect(isLive({})).toBe(false);
  });
});

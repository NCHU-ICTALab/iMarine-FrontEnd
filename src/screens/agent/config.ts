/* 數位員工設定讀取（spec 2026-07-11 §4）— settings 覆寫 .env 的唯一真相。
   agent.geminiKey / agent.model / agent.sourceMode 由 settings「數位員工」分區寫入；
   env 參數可注入供測試（預設 import.meta.env），不動 agent 引擎邏輯。 */
import { getSetting } from '../settings/storage';

type Env = Record<string, string | undefined>;
const metaEnv: Env = (import.meta as any).env ?? {};

export function effectiveKey(env: Env = metaEnv): string {
  const s = String(getSetting('agent.geminiKey', '') ?? '').trim();
  return s || env.VITE_GEMINI_API_KEY || '';
}

export function effectiveModel(): string {
  return getSetting('agent.model', '') || 'gemini-2.5-flash';
}

export function isLive(env: Env = metaEnv): boolean {
  if (getSetting<string>('agent.sourceMode', 'auto') === 'mock') return false;
  return !!effectiveKey(env);
}

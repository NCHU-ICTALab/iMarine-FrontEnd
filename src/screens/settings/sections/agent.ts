import { getSetting, subscribe } from '../storage';
import { effectiveKey, effectiveModel, isLive } from '../../agent/config';
import type { SettingsSection, ActionResult } from '../schema';

/* 數位員工分區（spec 2026-07-11 §3）— 全欄位有限生效，零佔位。
   測試連線動態 import @google/genai 與 friendlyError（皆屬 agent async chunk 的依賴，
   不讓 SDK 進 settings chunk）；key 空時短路不打 API。 */
async function testGemini(): Promise<ActionResult> {
  const key = effectiveKey();
  if (!key) return { ok: false, message: '未設定 key——填入上方欄位或於 .env 設定' };
  const model = effectiveModel();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4000);
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    await ai.models.generateContent({
      model, contents: 'ping',
      config: { maxOutputTokens: 1, abortSignal: ac.signal },
    });
    clearTimeout(t);
    return { ok: true, message: '連線成功 · ' + model };
  } catch (e) {
    clearTimeout(t);
    const raw = String((e as Error)?.message ?? e);
    try {
      const { friendlyError } = await import('../../agent/loop');
      return { ok: false, message: friendlyError(raw).message };
    } catch {
      return { ok: false, message: '連線失敗——' + raw.slice(0, 120) };
    }
  }
}

export const agentSection: SettingsSection = {
  id: 'agent',
  label: '數位員工',
  color: '#B48CFF',
  status: () => (isLive() ? 'GEMINI LIVE' : '劇本 MOCK'),
  groups: [
    {
      title: 'Gemini 連線', badge: '生效中', badgeTone: 'live', saveMode: 'explicit',
      fields: [
        { kind: 'password', key: 'agent.geminiKey', label: 'Gemini API Key', help: '留空使用 .env 的 VITE_GEMINI_API_KEY；僅存本機瀏覽器（localStorage），勿在共用電腦填入' },
        { kind: 'select', key: 'agent.model', label: '模型', options: () => [
          { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash（預設）' },
          { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
          { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
        ], help: '對話與測試連線共用；儲存後即生效' },
        { kind: 'action', label: '連線驗證', button: '測試連線', run: testGemini },
      ],
    },
    {
      title: '行為', badge: '即時生效', badgeTone: 'live', saveMode: 'instant',
      fields: [
        { kind: 'select', key: 'agent.sourceMode', label: '資料源模式', options: () => [
          { value: 'auto', label: '自動（有 key 走 GEMINI LIVE）' },
          { value: 'mock', label: '強制劇本 MOCK' },
        ], help: 'demo 想展示確定性劇本時不用刪 key' },
        { kind: 'toggle', key: 'agent.autoPatrol', label: '進頁自動巡檢', defaultOn: true, help: '關閉後首次進頁略過健檢動畫；切換後重新整理生效' },
      ],
    },
    {
      title: '狀態', badge: '唯讀', saveMode: 'instant',
      custom(el) {
        /* custom() 每次切回本分區都重跑，subscribe 無 teardown hook——
           render 先檢查 el.isConnected，detach 後首次回呼自動退訂，防止累積 */
        const off: Array<() => void> = [];
        const render = () => {
          if (!el.isConnected) { off.forEach((f) => f()); off.length = 0; return; }
          const live = isLive();
          const src = String(getSetting('agent.geminiKey', '') ?? '').trim() ? '設定頁'
            : (effectiveKey() ? '.env' : '無');
          el.innerHTML = '<div class="gnote">' + (live
            ? 'GEMINI LIVE（key 來源：' + src + '）· 模型 ' + effectiveModel()
            : '劇本 MOCK（' + (getSetting<string>('agent.sourceMode', 'auto') === 'mock' ? '強制' : '無 key') + '）') + '</div>';
        };
        render();
        off.push(subscribe('agent.geminiKey', render));
        off.push(subscribe('agent.sourceMode', render));
        off.push(subscribe('agent.model', render));
      },
    },
  ],
};

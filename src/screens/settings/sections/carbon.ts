import { getSetting } from '../storage';
import type { SettingsSection, ActionResult, SettingsCtx } from '../schema';

/* 真連線分區：API Base（explicit，變更需重新整理生效） + 測試連線 action（真 fetch /health，
   3s 逾時保護、絕不 throw/reject，一律 resolve 成 ActionResult 供 renderer 的 action 四態使用）
   + 鏈路資訊 custom（唯讀，讀 /state 顯示 SU 筆數摘要）。 */
async function testCarbon(_ctx: SettingsCtx): Promise<ActionResult> {
  const base = getSetting('carbon.apiBase', '') || (import.meta as any).env?.VITE_CARBON_API || 'http://127.0.0.1:8000';
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4000);
  try {
    const r = await fetch(base + '/health', { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return { ok: false, message: '回應異常 HTTP ' + r.status };
    const j = await r.json().catch(() => ({}));
    return { ok: true, message: '連線成功' + (j && j.status ? ' · ' + String(j.status) : '') };
  } catch {
    clearTimeout(t);
    return { ok: false, message: '無法連線 — 確認 PoC 後端（make chain + make api）已啟動' };
  }
}

export const carbonSection: SettingsSection = {
  id: 'carbon',
  label: '碳權代幣化',
  color: '#E9BC63',
  status: () => 'API 可設定',
  groups: [
    {
      title: 'API 連線', badge: '生效中', badgeTone: 'live', saveMode: 'explicit',
      fields: [
        { kind: 'text', key: 'carbon.apiBase', label: 'API Base URL', placeholder: 'http://127.0.0.1:8000', help: '留空使用 .env 的 VITE_CARBON_API；變更後重新整理生效' },
        { kind: 'action', label: '連線驗證', button: '測試連線', run: testCarbon },
      ],
    },
    {
      title: '鏈路資訊', badge: '唯讀', saveMode: 'instant',
      custom(el) {
        el.innerHTML = '<div class="gnote" id="cbChain">後端離線 — 依 README 前置步驟啟動 PoC 的 make chain + make api 後，此處顯示鏈上狀態摘要。</div>';
        const base = getSetting('carbon.apiBase', '') || (import.meta as any).env?.VITE_CARBON_API || 'http://127.0.0.1:8000';
        fetch(base + '/state').then((r) => r.json()).then((j) => {
          const n = Array.isArray(j?.sus) ? j.sus.length : 0;
          (el.querySelector('#cbChain') as HTMLElement).textContent = '鏈上狀態：SU ' + n + ' 筆 · 資料源 ' + base;
        }).catch(() => {});
      },
    },
  ],
};

import type { SettingsSection } from '../schema';

/* 佔位分區：欄位逐字對齊 docs/preview/preview-settings.html 的 PENDING.alert 定義。
   測試發送 action 恆為 disabled，run 不會被觸發（保留 {ok:false,message:''} 僅供型別滿足）。 */
export const alertSection: SettingsSection = {
  id: 'alert',
  label: '警報推播',
  color: '#FF7A59',
  status: () => '後端待接入',
  groups: [
    {
      title: '自動警報推播 · 後端整合',
      badge: '後端待接入',
      badgeTone: 'wait',
      saveMode: 'explicit',
      pending: true,
      fields: [
        { kind: 'text', key: 'alert.smsApi', label: '細胞簡訊發送 API', placeholder: 'https://cbs.example.tw/send', disabled: true },
        { kind: 'select', key: 'alert.sendThreshold', label: '發送門檻', options: () => [{ value: 'red', label: '紅色警戒以上' }], disabled: true },
        { kind: 'action', label: '測試發送', button: '測試發送', run: async () => ({ ok: false, message: '' }), disabled: true },
        { kind: 'note', text: '此區為預留骨架 — 後端整合後由協作者依實際需求增修欄位（見 README 協作者指南：新增一筆 schema 物件即可）。' },
      ],
    },
  ],
};

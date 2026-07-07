import type { SettingsSection } from '../schema';

/* 佔位分區：欄位逐字對齊 docs/preview/preview-settings.html 的 PENDING.dispatch 定義。 */
export const dispatchSection: SettingsSection = {
  id: 'dispatch',
  label: '派工建議',
  color: '#F5A54A',
  status: () => '後端待接入',
  groups: [
    {
      title: '即時派工建議 · 後端整合',
      badge: '後端待接入',
      badgeTone: 'wait',
      saveMode: 'explicit',
      pending: true,
      fields: [
        { kind: 'text', key: 'dispatch.inferEndpoint', label: 'ConvLSTM 推論端點', placeholder: 'http://backend/dispatch/infer', disabled: true },
        { kind: 'select', key: 'dispatch.modelUpdateFreq', label: '模型更新週期', options: () => [{ value: '10m', label: '每 10 分鐘' }], disabled: true },
        { kind: 'password', key: 'dispatch.cwaKey', label: 'CWA 資料源 KEY', disabled: true },
        { kind: 'note', text: '此區為預留骨架 — 後端整合後由協作者依實際需求增修欄位（見 README 協作者指南：新增一筆 schema 物件即可）。' },
      ],
    },
  ],
};

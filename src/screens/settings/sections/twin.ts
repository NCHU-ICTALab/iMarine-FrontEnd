import type { SettingsSection } from '../schema';

/* 佔位分區：後端未接入前的預留骨架。欄位逐字對齊 docs/preview/preview-settings.html 的
   PENDING.twin 定義（label/placeholder/select 選項文案）。 */
export const twinSection: SettingsSection = {
  id: 'twin',
  label: '沙盤推演',
  color: '#7FB4FF',
  status: () => '後端待接入',
  groups: [
    {
      title: '2.5D 沙盤推演 · 後端整合',
      badge: '後端待接入',
      badgeTone: 'wait',
      saveMode: 'explicit',
      pending: true,
      fields: [
        { kind: 'text', key: 'twin.aisEndpoint', label: 'AIS 資料源端點', placeholder: 'wss://ais.example.tw/stream', disabled: true },
        { kind: 'select', key: 'twin.snapshotFreq', label: '快照更新頻率', options: () => [{ value: '10m', label: '每 10 分鐘' }], disabled: true },
        { kind: 'note', text: '此區為預留骨架 — 後端整合後由協作者依實際需求增修欄位（見 README 協作者指南：新增一筆 schema 物件即可）。' },
      ],
    },
  ],
};

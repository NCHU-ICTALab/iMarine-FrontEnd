import type { SettingsSection } from '../schema';

/* 佔位分區：欄位逐字對齊 docs/preview/preview-settings.html 的 PENDING.epidemic 定義。
   額外附加一則 note 導引 Mapbox token 至前端設定分區統一管理。 */
export const epidemicSection: SettingsSection = {
  id: 'epidemic',
  label: '疫情追溯',
  color: '#F0648C',
  status: () => '後端待接入',
  groups: [
    {
      title: '疫情自動追溯 · 後端整合',
      badge: '後端待接入',
      badgeTone: 'wait',
      saveMode: 'explicit',
      pending: true,
      fields: [
        { kind: 'text', key: 'epidemic.crawlerSource', label: '情資爬蟲來源', placeholder: 'WHO DON / 疾管署 / 新聞 RSS', disabled: true },
        { kind: 'text', key: 'epidemic.whoApiEndpoint', label: 'WHO / 疾管署 API 端點', placeholder: 'https://api.example/who', disabled: true },
        { kind: 'select', key: 'epidemic.compareSchedule', label: '比對排程', options: () => [{ value: '1h', label: '每小時' }], disabled: true },
        { kind: 'note', text: '此區為預留骨架 — 後端整合後由協作者依實際需求增修欄位（見 README 協作者指南：新增一筆 schema 物件即可）。' },
        { kind: 'note', text: 'Mapbox token 於「前端設定」分區統一管理。' },
      ],
    },
  ],
};

import type { SettingsSection } from '../schema';

/* 疫情自動追溯 · 後端整合分區。
   已備 live provider（src/data/exchange/epidemic.ts）；後端位址供 demo 現場覆寫，
   維護者在 main.ts 接線時可讀 getSetting('epidemic.apiBase') || VITE_EPIDEMIC_API。 */
export const epidemicSection: SettingsSection = {
  id: 'epidemic',
  label: '疫情追溯',
  color: '#F0648C',
  status: () => '已備 provider · 待接線',
  groups: [
    {
      title: '疫情自動追溯 · 後端整合',
      badge: '後端位址',
      badgeTone: 'wait',
      saveMode: 'explicit',
      fields: [
        { kind: 'text', key: 'epidemic.apiBase', label: '後端位址', placeholder: 'http://127.0.0.1:8300' },
        { kind: 'note', text: '疫情追溯後端（iMarine-disease-tracking，FastAPI，port 8300）。留空則用 .env 的 VITE_EPIDEMIC_API；後端不在時頁面自動退 mock。' },
        { kind: 'note', text: 'Mapbox token 於「前端設定」分區統一管理。' },
      ],
    },
  ],
};

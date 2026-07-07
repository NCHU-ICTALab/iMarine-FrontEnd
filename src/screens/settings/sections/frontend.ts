import type { SettingsSection } from '../schema';

/* 本 task 先兩個 group（動效/地圖）；資料源總覽 group 於 Task 5 補上 */
export const frontendSection: SettingsSection = {
  id: 'frontend',
  label: '前端設定',
  color: '#35E0A6',
  status: () => '生效中',
  groups: [
    {
      title: '動效',
      badge: '即時生效',
      badgeTone: 'live',
      saveMode: 'instant',
      fields: [
        { kind: 'toggle', key: 'frontend.reduceMotion', label: '減少動態效果', help: '覆寫系統 prefers-reduced-motion，全站生效' },
        { kind: 'toggle', key: 'frontend.entrance', label: '進場動畫', defaultOn: true, help: '關閉後各頁 stagger 進場直接顯示終態' },
      ],
    },
    {
      title: '地圖服務',
      badge: 'Mapbox',
      badgeTone: 'blue',
      saveMode: 'explicit',
      fields: [
        { kind: 'password', key: 'frontend.mapboxToken', label: 'Mapbox Token', help: '優先於 .env 的 VITE_MAPBOX_TOKEN，疫情頁地圖使用（重新整理後生效）' },
      ],
    },
  ],
};

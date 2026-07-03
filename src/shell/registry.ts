import type { Mode, Screen } from '../screens/types';

export interface ScreenDef {
  id: string;
  title: string;
  short: string;
  color: string;
  mode: Mode;
  icon: string; // <svg> 內部 path 標記（自基準檔 rail 按鈕搬）
  load(): Promise<{ default: Screen }>;
}

// 順序：hero, carbon, policy, twin, dispatch, epidemic, alert
export const SCREENS: ScreenDef[] = [
  {
    id: 'hero',
    title: '永續智能航港生態系',
    short: '總覽',
    color: '#35E0A6',
    mode: 'cover',
    icon: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    load: () => import('../screens/hero/index'),
  },
  {
    id: 'carbon',
    title: '碳權代幣化交易',
    short: '碳權代幣化',
    color: '#E9BC63',
    mode: 'doc',
    icon: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5a3.4 3.4 0 100 5"/>',
    load: () => import('../screens/carbon/index'),
  },
  {
    id: 'policy',
    title: 'AI 政策輔助報告',
    short: '政策報告',
    color: '#38BDF8',
    mode: 'doc',
    icon: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7"/>',
    load: () => import('../screens/policy/index'),
  },
  {
    id: 'twin',
    title: '2.5D 數位孿生 · 24hr 沙盤推演',
    short: '2.5D 沙盤推演',
    color: '#7FB4FF',
    mode: 'full',
    icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    load: () => import('../screens/twin/index'),
  },
  {
    id: 'dispatch',
    title: '短時微氣候 · 即時派工建議',
    short: '即時派工建議',
    color: '#F5A54A',
    mode: 'ov',
    icon: '<path d="M4 15a8 8 0 0116 0"/><path d="M12 15l3.5-4"/><path d="M2 19h20"/>',
    load: () => import('../screens/dispatch/index'),
  },
  {
    id: 'epidemic',
    title: '疫情自動追溯',
    short: '疫情自動追溯',
    color: '#F0648C',
    mode: 'ov',
    icon: '<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    load: () => import('../screens/epidemic/index'),
  },
  {
    id: 'alert',
    title: '自動警報推播',
    short: '自動警報',
    color: '#FF7A59',
    mode: 'ov',
    icon: '<path d="M6 16V11a6 6 0 1112 0v5l2 3H4z"/><path d="M10 21a2 2 0 004 0"/>',
    load: () => import('../screens/alert/index'),
  },
];

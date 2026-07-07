import type { DataExchange } from '../../data/types';
import type { ToastOpts } from '../types';

export interface SettingsCtx {
  data: DataExchange;
  toast(o: ToastOpts): void;
  rerender(): void; // 重渲染目前分區（狀態變更後由 custom 渲染器呼叫）
  goto(sectionId: string, groupTitle?: string): void; // 跳轉分區並高亮指定 group（跨區依賴導引）
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export type SettingField =
  | { kind: 'text'; key: string; label: string; placeholder?: string; help?: string; disabled?: boolean }
  | { kind: 'password'; key: string; label: string; help?: string; disabled?: boolean }
  | { kind: 'select'; key: string; label: string; options: () => { value: string; label: string }[]; help?: string; disabled?: boolean }
  | { kind: 'toggle'; key: string; label: string; help?: string; disabled?: boolean; defaultOn?: boolean }
  | { kind: 'number'; key: string; label: string; min?: number; max?: number; step?: number; help?: string; disabled?: boolean }
  | { kind: 'slider'; key: string; label: string; min: number; max: number; step?: number; disabled?: boolean }
  | { kind: 'action'; label: string; button: string; run: (ctx: SettingsCtx) => Promise<ActionResult>; disabled?: boolean }
  | { kind: 'note'; text: string };

export interface SettingGroup {
  title: string;
  badge?: string;
  badgeTone?: 'live' | 'blue' | 'wait' | 'plain';
  saveMode: 'instant' | 'explicit';
  pending?: boolean; // 佔位 group：降飽和 + 全欄位視為 disabled
  fields?: SettingField[];
  custom?: (el: HTMLElement, ctx: SettingsCtx) => void;
}

export interface SettingsSection {
  id: string;
  label: string;
  color: string;
  status: () => string;
  groups: SettingGroup[];
}

/* schema 載入期驗證：帶 key 的欄位全域唯一，重複視為工程錯誤直接 throw */
export function validateSections(sections: SettingsSection[]): void {
  const seen = new Set<string>();
  for (const s of sections)
    for (const g of s.groups)
      for (const f of g.fields ?? []) {
        if (!('key' in f)) continue;
        if (seen.has(f.key)) throw new Error('settings schema: duplicate key "' + f.key + '"');
        seen.add(f.key);
      }
}

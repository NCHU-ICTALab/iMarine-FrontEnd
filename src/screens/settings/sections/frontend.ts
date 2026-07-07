import type { SettingsSection } from '../schema';

/* Task 5：groups[0] 補上「資料源總覽」custom（唯讀，各模組 provider.source 一覽 + carbon 真 /health 探測）。 */
export const frontendSection: SettingsSection = {
  id: 'frontend',
  label: '前端設定',
  color: '#35E0A6',
  status: () => '生效中',
  groups: [
    {
      title: '資料源總覽',
      badge: '唯讀',
      saveMode: 'instant',
      custom(el, ctx) {
        const rows: { color: string; name: string; src: 'live' | 'mock'; note: string; probe?: boolean }[] = [
          { color: '#E9BC63', name: '碳權代幣化交易', src: ctx.data.carbon.source, note: '偵測中…', probe: true },
          { color: '#38BDF8', name: 'AI 政策輔助報告', src: ctx.data.policy.source, note: '等待協作者後端' },
          { color: '#7FB4FF', name: '2.5D 沙盤推演', src: ctx.data.twin.source, note: '內建資料（vendored）' },
          { color: '#F5A54A', name: '即時派工建議', src: ctx.data.dispatch.source, note: '等待協作者後端' },
          { color: '#F0648C', name: '疫情自動追溯', src: ctx.data.epidemic.source, note: '等待協作者後端' },
          { color: '#FF7A59', name: '自動警報推播', src: ctx.data.alert.source, note: '等待協作者後端' },
        ];
        el.innerHTML =
          rows.map((r, i) =>
            '<div class="dsrow"><span class="d" style="background:' + r.color + '"></span>' +
            '<span class="nm">' + r.name + '</span>' +
            '<span class="chip' + (r.src === 'live' ? ' live' : '') + '">' + r.src.toUpperCase() + '</span>' +
            '<span class="st" data-ds="' + i + '">' + r.note + '</span></div>',
          ).join('') +
          '<div class="gnote">後端接入後，此表即時反映各模組 provider 的 source 與連線狀態。</div>';
        // carbon 真探測：/health 可達 → ok，否則離線（AbortController 3s 逾時）
        const st = el.querySelector('[data-ds="0"]') as HTMLElement;
        const base = (ctx.data.carbon as { base?: string }).base || '';
        const ac = new AbortController();
        setTimeout(() => ac.abort(), 3000);
        fetch(base + '/health', { signal: ac.signal })
          .then((r) => { st.textContent = r.ok ? 'PoC FastAPI · ok' : 'PoC FastAPI · 異常 ' + r.status; })
          .catch(() => { st.textContent = 'PoC FastAPI · 離線'; });
      },
    },
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

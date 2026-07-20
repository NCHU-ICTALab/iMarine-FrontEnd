/* dispatch 契約 smoke——端點以 src/data/exchange/dispatch.ts 現行呼叫為準。
   本模組只讀 GET /api/v1/dispatch/risk 的 forecast_anchors 與 cwa 兩個頂層欄位，
   其餘欄位（trace、system_audit_summary 等）為後端內部稽核用途，不在 smoke 範圍內。
   完整欄位說明見 docs/collab/dispatch.md §4。 */
import { checkFields, fetchJson } from '../lib.mjs';

export default {
  base: process.env.VITE_DISPATCH_API ?? 'http://127.0.0.1:8200',
  checks: [
    {
      name: 'GET /api/v1/dispatch/risk 回 forecast_anchors 陣列，首筆欄位齊',
      async run(base) {
        const d = await fetchJson(`${base}/api/v1/dispatch/risk?target_area=KHH`);
        const anchors = d?.forecast_anchors;
        if (!Array.isArray(anchors)) throw new Error(`預期 forecast_anchors array，得到 ${typeof anchors}`);
        if (anchors.length === 0) throw new Error('forecast_anchors 為空陣列');
        const errs = checkFields(anchors[0], {
          label: 'string',
          offset_minutes: 'number',
          rain: 'object',
          wind_speed: 'object',
          wind_gust: 'object',
        });
        if (errs.length) throw new Error(errs.join('；'));
        const rainErrs = checkFields(anchors[0].rain, { amount_level: 'string?' });
        if (rainErrs.length) throw new Error(rainErrs.join('；'));
        return `${anchors.length} 個錨點，首筆（${anchors[0].label}）欄位齊`;
      },
    },
    {
      name: 'GET /api/v1/dispatch/risk 回 cwa 陣列（+3h/+6h 兩筆）',
      async run(base) {
        const d = await fetchJson(`${base}/api/v1/dispatch/risk?target_area=KHH`);
        const cwa = d?.cwa;
        if (!Array.isArray(cwa)) throw new Error(`預期 cwa array，得到 ${typeof cwa}`);
        if (cwa.length !== 2) throw new Error(`預期 cwa 長度 2，得到 ${cwa.length}`);
        const errs = checkFields(cwa[0], { window: 'string', rainLevel: 'string', beaufort: 'number' });
        if (errs.length) throw new Error(errs.join('；'));
        return `cwa windows：${cwa.map((w) => w.window).join(', ')}`;
      },
    },
    {
      name: 'GET /health 回 status',
      async run(base) {
        const d = await fetchJson(`${base}/health`);
        const errs = checkFields(d, { status: 'string' });
        if (errs.length) throw new Error(errs.join('；'));
        return `status=${d.status}`;
      },
    },
  ],
};

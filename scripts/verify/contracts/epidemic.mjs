/* epidemic（疫情自動追溯後端）契約 smoke —— 端點以 src/data/exchange/epidemic.ts 現行呼叫為準。
   後端：iMarine-disease-tracking（FastAPI），port 8300（見 docs/collab/README.md）。
   起服務見 docs/collab/epidemic.md §2。/jobs/refresh 會打外部網路（疾管署/WHO）+ 改狀態，
   不放 smoke，由 verify:live 與整合卡 §6 覆蓋。 */
import { checkFields, fetchJson } from '../lib.mjs';

export default {
  base: process.env.VITE_EPIDEMIC_API ?? 'http://127.0.0.1:8300',
  checks: [
    {
      name: 'GET /health 回 status ok',
      async run(base) {
        const d = await fetchJson(`${base}/health`);
        if (d?.status !== 'ok') throw new Error(`status=${d?.status}`);
        return `ok · target_port=${d.target_port ?? '?'} · ais=${d.ais_provider ?? '?'}`;
      },
    },
    {
      name: 'GET /assessments 回 { assessments: [] } 且風險欄位形狀正確',
      async run(base) {
        const d = await fetchJson(`${base}/assessments`);
        const rows = d?.assessments;
        if (!Array.isArray(rows)) throw new Error(`預期 assessments array，得到 ${typeof rows}`);
        if (rows.length === 0) return '0 筆（可接受：無抵港評估時前端退 mock）';
        const errs = checkFields(rows[0], {
          ship_code: 'string',
          ship_name: 'string?',
          prev_port: 'string?',
          risk_level: 'string',
          score: 'number',
        });
        if (errs.length) throw new Error(errs.join('；'));
        if (!Array.isArray(rows[0].matched_outbreaks)) throw new Error('matched_outbreaks 需為 array');
        return `${rows.length} 艘抵港評估，首筆 ${rows[0].ship_name ?? rows[0].ship_code}（${rows[0].risk_level}）欄位齊`;
      },
    },
  ],
};

/* policy（rag-agent）契約 smoke——端點以 src/data/exchange/policy.ts 現行呼叫為準。
   POST /api/chat、/api/report 為 LLM 呼叫（慢、有成本），不放 smoke，
   由 npm run verify:live -- policy 與 docs/collab/policy.md §6 覆蓋。 */
import { checkFields, fetchJson } from '../lib.mjs';

export default {
  base: process.env.VITE_POLICY_API ?? 'http://127.0.0.1:8100',
  checks: [
    {
      name: 'GET /api/sources 回陣列且欄位形狀正確',
      async run(base) {
        const rows = await fetchJson(`${base}/api/sources`);
        if (!Array.isArray(rows)) throw new Error(`預期 array，得到 ${typeof rows}`);
        if (rows.length === 0) return '0 筆（可接受：知識庫可為空）';
        const errs = checkFields(rows[0], {
          source_id: 'string',
          source_name: 'string?',
          source_type: 'string?',
          chunk_count: 'number?',
          enabled: 'boolean?',
        });
        if (errs.length) throw new Error(errs.join('；'));
        return `${rows.length} 個知識庫，首筆欄位齊`;
      },
    },
    {
      name: 'GET /api/report/templates 回陣列',
      async run(base) {
        const rows = await fetchJson(`${base}/api/report/templates`);
        if (!Array.isArray(rows)) throw new Error(`預期 array，得到 ${typeof rows}`);
        return `${rows.length} 個報告模版`;
      },
    },
  ],
};

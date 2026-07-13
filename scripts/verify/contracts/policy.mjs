/* policy（rag-agent）契約 smoke——端點以 src/data/exchange/policy.ts 現行呼叫為準。
   POST /api/chat、/api/report、/api/policy/refresh、/api/settings/{embed,reembed}
   為 LLM／重寫入呼叫（慢、有成本或會改狀態），不放 smoke，
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
    {
      name: 'GET /api/policy/briefs 回 { briefs: [] } 且晨報欄位形狀正確',
      async run(base) {
        const d = await fetchJson(`${base}/api/policy/briefs`);
        const briefs = d?.briefs;
        if (!Array.isArray(briefs)) throw new Error(`預期 briefs array，得到 ${typeof briefs}`);
        if (briefs.length === 0) return '0 筆（可接受：晨報快取可為空，前端退回 mock）';
        const errs = checkFields(briefs[0], {
          id: 'string',
          title: 'string',
          time: 'string?',
          grounding: 'number?',
          retrieved: 'number?',
        });
        if (errs.length) throw new Error(errs.join('；'));
        return `${briefs.length} 則 live 晨報，首筆欄位齊`;
      },
    },
    {
      name: 'GET /api/schedule 回排程狀態',
      async run(base) {
        const s = await fetchJson(`${base}/api/schedule`);
        const errs = checkFields(s, {
          enabled: 'boolean',
          time: 'string',
        });
        if (errs.length) throw new Error(errs.join('；'));
        return `enabled=${s.enabled} time=${s.time}`;
      },
    },
  ],
};

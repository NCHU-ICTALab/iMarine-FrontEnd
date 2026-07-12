#!/usr/bin/env node
/* 契約 smoke runner：npm run verify:contract -- <module>
   直打該模組後端 API 驗欄位形狀，秒級判定「後端契約變了」vs「前端接壞了」。
   契約檔在 contracts/<module>.mjs（契約即代碼：後端契約變更的 PR 必須同步更新，見 CONTRIBUTING §6）。 */
import { formatResults, summarize } from './lib.mjs';

const MODULES = ['policy', 'dispatch', 'epidemic', 'alert'];
const mod = process.argv[2];
if (!mod || !MODULES.includes(mod)) {
  console.error(`用法：npm run verify:contract -- <${MODULES.join('|')}>`);
  process.exit(2);
}

const def = (await import(`./contracts/${mod}.mjs`)).default;
if (def.pending) {
  console.error(`[${mod}] 契約待定：${def.reason}`);
  console.error(`後端契約定案的第一個 live PR 需填實 scripts/verify/contracts/${mod}.mjs 與 docs/collab/${mod}.md §4`);
  process.exit(2);
}

console.log(`[${mod}] 契約 smoke → ${def.base}`);
const results = [];
for (const c of def.checks) {
  try {
    const detail = await c.run(def.base);
    results.push({ name: c.name, ok: true, detail });
  } catch (e) {
    // Node fetch 連線被拒：單位址時 cause.code=ECONNREFUSED，多位址時包在 AggregateError.errors 裡
    const code = e?.cause?.code ?? e?.cause?.errors?.[0]?.code;
    const detail =
      code === 'ECONNREFUSED'
        ? `後端未啟動（${def.base} 連線被拒）——照 docs/collab/${mod}.md §2 起服務後重試`
        : e?.name === 'AbortError' || e?.name === 'TimeoutError'
          ? '逾時（5s 內無回應）'
          : String(e?.message ?? e);
    results.push({ name: c.name, ok: false, detail });
  }
}
console.log(formatResults(results));
const s = summarize(results);
console.log(`${s.passed} PASS / ${s.failed} FAIL`);
process.exit(s.exitCode);

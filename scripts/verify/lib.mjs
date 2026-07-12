/* verify 腳本共用純函式：欄位形狀檢查、結果彙整、輸出格式。
   純函式走 vitest TDD（tests/verify-lib.test.ts）；fetchJson 為 I/O helper 不進單元測試。 */

function kindOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/** 驗物件欄位形狀。spec 值：'string'|'number'|'boolean'|'array'|'object'，尾綴 ? 表選填。 */
export function checkFields(obj, spec) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [`預期物件，得到 ${kindOf(obj)}`];
  }
  const errs = [];
  for (const [key, raw] of Object.entries(spec)) {
    const optional = raw.endsWith('?');
    const kind = optional ? raw.slice(0, -1) : raw;
    const v = obj[key];
    if (v === undefined) {
      if (!optional) errs.push(`缺欄位 ${key}`);
      continue;
    }
    const actual = kindOf(v);
    if (actual !== kind) errs.push(`欄位 ${key} 預期 ${kind}，得到 ${actual}`);
  }
  return errs;
}

export function summarize(results) {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { passed, failed, exitCode: failed > 0 ? 1 : 0 };
}

export function formatResults(results) {
  return results
    .map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`)
    .join('\n');
}

/** 原生 fetch + 逾時；非 2xx throw。契約檔用。 */
export async function fetchJson(url, init = {}, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

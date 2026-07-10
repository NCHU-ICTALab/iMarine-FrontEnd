/* 七工具：declaration（餵 Gemini functionDeclarations）+ 執行函式（live/mock 共用）。
   description 寫「何時呼叫」（prescriptive trigger），spec §5。 */
import type { ScreenCtx } from '../types';
import type { AgentModule, RunbookEntry } from '../../data/types';
import runbookJson from '../../data/mock/agent-runbook.json';
import { setSetting } from '../settings/storage';
import { runDiagnostics } from './diagnostics';

export const AGENT_MODULES: { id: AgentModule; name: string; color: string }[] = [
  { id: 'carbon', name: '碳權', color: '#E9BC63' },
  { id: 'policy', name: '政策', color: '#38BDF8' },
  { id: 'twin', name: '孿生', color: '#7FB4FF' },
  { id: 'dispatch', name: '派工', color: '#F5A54A' },
  { id: 'epidemic', name: '疫情', color: '#F0648C' },
  { id: 'alert', name: '警報', color: '#FF7A59' },
];

export const SETTING_WHITELIST = [
  'policy.llmMode', 'frontend.reduceMotion', 'frontend.entrance', 'carbon.apiBase',
];

/* tool_call 事件的「有效模組」：有靜態 module（工具本身綁模組，如 ask_policy_rag）用靜態；
   get_module_data 沒有靜態 module（讀任一模組），改從 args.module 補（需落在六模組內）；
   否則 undefined（如 navigate_to_screen）。live 態 loop.ts 的 tool_call 事件只帶 tool.module，
   get_module_data 因此漏帶模組，導致右欄工具卡/足跡/tooltip 全部略過（controller.ts 用此函式補）。 */
export function effectiveModule(tool: string, args: Record<string, unknown>, staticModule?: AgentModule): AgentModule | undefined {
  if (staticModule) return staticModule;
  if (tool === 'get_module_data' && typeof args.module === 'string' && AGENT_MODULES.some((m) => m.id === args.module))
    return args.module as AgentModule;
  return undefined;
}

export interface ToolRunResult {
  summaryHtml: string;
  llmText: string;
  module?: AgentModule;
  data?: unknown; // 結構化附載（run_diagnostics 回 DiagReport，控制器據此更新燈號牆）
}
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // Gemini functionDeclaration parameters（JSON Schema 子集）
  module?: AgentModule;
  confirm?: boolean;
  run(args: Record<string, unknown>): Promise<ToolRunResult>;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 回答文字 → HTML：先 escape，再把 {{m:module}} 轉成模組色 citation chip（點擊由控制器委派跳頁） */
export function renderAgentText(text: string): string {
  let html = esc(text);
  html = html.replace(/\{\{m:(\w+)\}\}/g, (_m, id: string) => {
    const mod = AGENT_MODULES.find((x) => x.id === id);
    return mod ? `<span class="mchip" data-nav="${mod.id}" style="--mc:${mod.color}"><i></i>${mod.name}</span>` : '';
  });
  return html.replace(/\n/g, '<br>');
}

/* snapshot → LLM 可讀摘要：通用 JSON 截斷（誠實、不猜欄位），卡片另給人類可讀一行 */
function jsonBrief(v: unknown, max = 1200): string {
  const s = JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + '…(截斷)' : s;
}

export function createTools(ctx: ScreenCtx, deps: { scheduleNav(id: string): void }): AgentTool[] {
  return [
    {
      name: 'get_module_data', module: undefined,
      description: '讀取指定功能模組的即時資料快照。當使用者詢問任何模組的現況、數字、或要求跨模組整合摘要時呼叫。',
      parameters: { type: 'object', properties: { module: { type: 'string', enum: AGENT_MODULES.map((m) => m.id), description: '模組 id' } }, required: ['module'] },
      async run(args) {
        const m = args.module as AgentModule;
        const snap: any = await ctx.data[m].snapshot();
        const name = AGENT_MODULES.find((x) => x.id === m)!.name;
        /* carbon 特例：後端離線回 ok:false + 全零，必須標示離線而非把零值當真（spec §5） */
        if (m === 'carbon' && snap && snap.ok === false)
          return { module: m, summaryHtml: `碳權後端<b>離線</b>（:8000）`, llmText: '碳權後端目前離線（:8000 連不上），沒有可信數字，請勿引用零值。' };
        return { module: m, summaryHtml: `已讀取${name}模組快照`, llmText: `${name}模組快照 JSON：${jsonBrief(snap)}` };
      },
    },
    {
      name: 'ask_policy_rag', module: 'policy',
      description: '向政策 RAG 知識庫提問（法規、政策、航運事件分析）。當問題涉及法規依據、政策影響、國際事件時呼叫。',
      parameters: { type: 'object', properties: { question: { type: 'string', description: '要問知識庫的問題' } }, required: ['question'] },
      async run(args) {
        try {
          const r = await ctx.data.policy.chat!(String(args.question), []);
          return { module: 'policy', summaryHtml: `知識庫命中 ${r.sources.length} 條證據`, llmText: `知識庫回答：${r.answerText}` };
        } catch {
          return { module: 'policy', summaryHtml: '知識庫離線，退回示範情報', llmText: '（示範）政策後端未啟動，以下為示範情報摘要：IMO 淨零框架與紅海航線中斷為近期兩大政策焦點，建議關注碳成本傳導。' };
        }
      },
    },
    {
      name: 'run_diagnostics',
      description: '執行全系統健康檢查（各後端連線、延遲、設定完整性）。當使用者要求健檢、回報系統異常、或問「有沒有問題」時呼叫。',
      parameters: { type: 'object', properties: {} },
      async run() {
        const rep = await runDiagnostics(ctx);
        const down = Object.entries(rep.modules).filter(([, v]) => v.status === 'down' || v.status === 'degraded');
        return {
          summaryHtml: down.length ? `發現 ${down.length} 項異常` : '全系統正常',
          llmText: `診斷報告 JSON：${JSON.stringify(rep.modules)}`,
          data: rep, // 控制器攔截更新 lastDiag + 燈號牆（Task 7）
        };
      },
    },
    {
      name: 'search_runbook',
      description: '查詢維運知識庫（已知問題與修復步驟）。當診斷發現異常、或使用者問「怎麼修」時呼叫。',
      parameters: { type: 'object', properties: { symptom: { type: 'string', description: '症狀描述關鍵字' } }, required: ['symptom'] },
      async run(args) {
        const kw = String(args.symptom).toLowerCase();
        const rbs = runbookJson as RunbookEntry[];
        const hit = rbs.filter((r) => kw.split(/\s+/).some((w) => w && (r.symptom + r.cause).toLowerCase().includes(w)));
        const list = (hit.length ? hit : rbs.slice(0, 3));
        return {
          summaryHtml: `命中 ${list.length} 條維運知識`,
          llmText: list.map((r) => `【${r.symptom}】原因：${r.cause}；修復：${r.fix.join('→')}`).join('\n'),
        };
      },
    },
    {
      name: 'navigate_to_screen',
      description: '帶使用者跳轉到指定功能頁。只在使用者明確要求前往/查看某頁時呼叫；跳轉會在回答結束後執行。',
      parameters: { type: 'object', properties: { id: { type: 'string', enum: ['hero', ...AGENT_MODULES.map((m) => m.id), 'settings'], description: '目標 screen id' } }, required: ['id'] },
      async run(args) {
        deps.scheduleNav(String(args.id)); // 排程：控制器在 done 後 ~1.5s 執行（spec §5）
        return { summaryHtml: `已排程跳轉 → ${args.id}`, llmText: `已排程跳轉到 ${args.id} 頁，回答結束後自動前往。` };
      },
    },
    {
      name: 'place_carbon_order', module: 'carbon', confirm: true,
      description: '碳權掛單（寫入鏈上交易，需人工確認）。只在使用者明確要求掛單/上架碳權時呼叫。',
      parameters: { type: 'object', properties: {
        token_id: { type: 'number', description: '要掛單的已發行 SU 代幣 id' },
        price: { type: 'number', description: '單價（整數）' },
      }, required: ['token_id', 'price'] },
      async run(args) {
        try {
          /* 端點以 PoC 後端實際路由為準（backend/api.py:66-73 ListBody）：
             POST /list，body { token_id: int, price: int }，price 為整數。 */
          const r = await fetch(ctx.data.carbon.base + '/list', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token_id: args.token_id, price: Math.round(Number(args.price)) }),
          });
          if (!r.ok) throw new Error(String(r.status));
          return { module: 'carbon', summaryHtml: `掛單成功：SU #${args.token_id} @ $${args.price}`, llmText: '掛單成功，已寫入鏈上。' };
        } catch {
          return { module: 'carbon', summaryHtml: '（示範）後端離線，掛單以示範模式記錄', llmText: '（示範）碳權後端未啟動，本次掛單為示範性質、未寫入鏈上。' };
        }
      },
    },
    {
      name: 'update_setting', confirm: true,
      description: '修改系統設定（僅白名單 key，需人工確認）。當使用者要求切換模型接口、動效等設定，或修復建議需要改設定時呼叫。',
      parameters: { type: 'object', properties: {
        key: { type: 'string', description: `設定 key，只允許：${SETTING_WHITELIST.join(', ')}` },
        value: { type: 'string', description: '新值（布林用 "true"/"false"）' },
      }, required: ['key', 'value'] },
      async run(args) {
        const key = String(args.key);
        if (!SETTING_WHITELIST.includes(key))
          return { summaryHtml: '設定 key 不在允許清單，已拒絕', llmText: `key「${key}」不在允許清單（${SETTING_WHITELIST.join(', ')}），未修改。` };
        const raw = String(args.value);
        const v = raw === 'true' ? true : raw === 'false' ? false : raw;
        setSetting(key, v);
        return { summaryHtml: `已更新設定 ${key} = ${raw}`, llmText: `設定 ${key} 已更新為 ${raw}，即時生效。` };
      },
    },
  ];
}

/* Gemini manual agent loop — live 態的 AgentEvent 產生器（spec §8）。
   模型每輪 generateContentStream：文字 → text_delta；functionCalls → 執行工具 →
   functionResponse 回填 → 下一輪；直到無 functionCall 純文字回合 → done。
   confirm 工具（tools[].confirm）先發 confirm_request、等 io.waitConfirm。 */
import { GoogleGenAI } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import type { AgentEvent } from '../../data/types';
import type { AgentTool } from './tools';
import type { EngineIO } from './replay';

const MODEL = 'gemini-2.5-flash';
const MAX_TURNS = 8; // 防失控 loop 上限

export const SYSTEM_PROMPT = [
  '你是 iMarine 永續智能航港生態系的「數位員工」，服務高雄港營運團隊。',
  '生態系六模組：carbon 碳權代幣化交易、policy 政策 RAG 報告、twin 數位孿生沙盤、dispatch 微氣候派工、epidemic 疫情追溯、alert 警報推播。',
  '規則：',
  '1. 回答一律繁體中文；引用某模組資料時在句尾加 {{m:模組id}} 標記（如 {{m:carbon}}）。',
  '2. 數字只能出自工具結果，絕不編造；工具回報離線就照實說離線。',
  '3. 多步驟任務的第一則回覆第一行輸出計畫：PLAN::步驟1｜步驟2｜步驟3（3-5 步，之後不再輸出 PLAN）。',
  '4. 需要系統健檢先呼叫 run_diagnostics，有異常再呼叫 search_runbook 給修復步驟。',
  '5. 回答精簡（150 字內），這是大螢幕簡報場景。',
].join('\n');

export function parsePlan(text: string): { steps: string[]; rest: string } {
  const m = text.match(/^PLAN::([^\n]+)\n?/);
  if (!m) return { steps: [], rest: text };
  return { steps: m[1].split('｜').map((s) => s.trim()).filter(Boolean), rest: text.slice(m[0].length) };
}

export async function* runGemini(opts: {
  apiKey: string; tools: AgentTool[]; history: unknown[]; userText: string; io: EngineIO;
}): AsyncGenerator<AgentEvent> {
  const { tools, io } = opts;
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  /* 對「本地副本」工作：abort/error 時不污染共用 history（半截 functionCall 會讓下一輪
     API 呼叫爆錯）；只在成功 done 時把完整回合（含最終回答文字）同步回 opts.history。
     history 對外型別為 unknown[]（避免把 SDK 型別外洩到 data/types.ts），此處是唯一的邊界轉型。 */
  const hist = opts.history as Content[];
  const contents: Content[] = [...hist];
  contents.push({ role: 'user', parts: [{ text: opts.userText }] });
  const declarations: FunctionDeclaration[] = tools.map((t) => ({
    name: t.name, description: t.description, parametersJsonSchema: t.parameters,
  }));

  let planSent = false;
  let stepIdx = 0;
  let finalText = ''; // 累積最終回答（同步回 history 用）
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (io.signal.aborted) return;
      const stream = await ai.models.generateContentStream({
        model: MODEL, contents,
        config: { systemInstruction: SYSTEM_PROMPT, tools: [{ functionDeclarations: declarations }] },
      });

      let text = '';
      const calls: { name: string; args: Record<string, unknown> }[] = [];
      /* 首回合文字先緩衝到出現換行或累積 40 字才 flush：PLAN:: 前綴可能被 chunk 切半
         （如 "PL" + "AN::…"），startsWith 判不出來，一律以緩衝條件杜絕誤判 */
      const flushFirst = () => { planSent = true; return parsePlan(text); };
      for await (const chunk of stream) {
        if (io.signal.aborted) return;
        const t = chunk.text;
        if (t) {
          text += t;
          if (!planSent) {
            if (!text.includes('\n') && text.length < 40) continue; // 續緩衝
            const { steps, rest } = flushFirst();
            if (steps.length) yield { kind: 'plan', steps };
            if (rest) { yield { kind: 'text_delta', text: rest }; finalText += rest; }
            text = '';
            continue;
          }
          yield { kind: 'text_delta', text: t };
          finalText += t;
        }
        for (const fc of chunk.functionCalls ?? []) {
          if (!fc.name) continue; // FunctionCall.name 為 optional，缺名的呼叫無法執行、略過
          calls.push({ name: fc.name, args: fc.args ?? {} });
        }
      }
      if (!planSent && text) { // 短回答整段在緩衝內結束：flush 一樣走 parsePlan
        const { steps, rest } = flushFirst();
        if (steps.length) yield { kind: 'plan', steps };
        if (rest) { yield { kind: 'text_delta', text: rest }; finalText += rest; }
        text = '';
      }

      if (!calls.length) {
        /* 成功收尾：把完整回合寫回共用 history（含最終回答，供多輪追問） */
        contents.push({ role: 'model', parts: [{ text: finalText }] });
        hist.length = 0;
        hist.push(...contents);
        yield { kind: 'done' };
        return;
      }

      /* 執行本輪全部 functionCalls，結果回填 */
      contents.push({ role: 'model', parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })) });
      const responses: Part[] = [];
      for (const c of calls) {
        const tool = tools.find((t) => t.name === c.name);
        if (!tool) { responses.push({ functionResponse: { name: c.name, response: { error: 'unknown tool' } } }); continue; }
        yield { kind: 'step_start', index: stepIdx++, caption: `正在執行 ${tool.name}…` };
        if (tool.confirm) {
          const ev = { kind: 'confirm_request', tool: c.name, args: c.args, summaryHtml: `執行 ${tool.name}（${JSON.stringify(c.args)}）？` } as const;
          yield ev;
          const ok = await io.waitConfirm(ev);
          if (io.signal.aborted) return;
          if (!ok) { responses.push({ functionResponse: { name: c.name, response: { result: '使用者取消了這個動作' } } }); continue; }
        }
        yield { kind: 'tool_call', tool: c.name, args: c.args, module: tool.module };
        const t0 = performance.now();
        const r = await io.runTool(c.name, c.args);
        yield { kind: 'tool_result', tool: c.name, summaryHtml: r.summaryHtml, module: r.module ?? tool.module, ms: Math.round(performance.now() - t0) };
        responses.push({ functionResponse: { name: c.name, response: { result: r.llmText } } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    yield { kind: 'error', message: '已達工具呼叫上限，任務中止。' };
  } catch (e) {
    if (!io.signal.aborted) yield { kind: 'error', message: 'Gemini 連線異常：' + String((e as Error).message ?? e) };
  }
}

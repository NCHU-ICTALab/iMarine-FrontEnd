/* settings「政策報告」知識庫分區的 mock fallback 與本機檢索參數。
   - mountMockKb：後端（rag-agent）不在時，整組還原原版 mock 知識庫體驗（Task 2 加入）。
   - strategyBlockHtml/bindStrategyBlock：檢索策略區塊，live modal 共用（Task 4 加入）。
   - kbParams：live 知識庫（source_id）的本機檢索參數，存而不用——後端無對應 API，
     之後支援時只改讀取點。mock 庫的參數仍存 Kb 物件（key 'policy.kbs'），互不相干。 */
import { getSetting, setSetting } from '../storage';
import type { Kb } from './policy';

/* html escape（policy.ts 的 esc 為模組私有，為不動 PR 檔在此自帶） */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- live 知識庫本機檢索參數（key 'policy.kbParams'） ---------- */
export interface KbParams {
  chunk: { size: number; overlap: number };
  retrieval: Kb['retrieval'];
}

export function defaultKbParams(): KbParams {
  return {
    chunk: { size: 512, overlap: 64 },
    retrieval: {
      strategy: 'vector', hybridWeight: 60, rerank: false, rerankModel: '',
      embeddingModel: '',
    },
  };
}

function getAllKbParams(): Record<string, KbParams> {
  return getSetting<Record<string, KbParams>>('policy.kbParams', {});
}
export function getKbParams(sourceId: string): KbParams | null {
  return getAllKbParams()[sourceId] ?? null;
}
export function setKbParams(sourceId: string, p: KbParams): void {
  const all = getAllKbParams();
  all[sourceId] = p;
  setSetting('policy.kbParams', all);
}

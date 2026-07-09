/* 系統設定「政策報告」分區 ↔ rag-agent 後端資料層。
   設定頁的模型管理接真後端：測試連線、列 Ollama 模型、把「系統預設模型」寫入後端 llm_config。
   後端不在時各函式丟出錯誤，由呼叫端 fallback（維持既有 mock 行為，不影響 demo）。 */

const BASE: string =
  (import.meta as any).env?.VITE_POLICY_API ?? 'http://127.0.0.1:8100';

export interface BackendSettings {
  llm: { provider: string; base_url: string; model: string; api_key_tail: string };
  embed: { backend: string; model: string; base_url: string; api_key_tail: string };
  presets: Record<string, string>;
}

export async function getBackendSettings(): Promise<BackendSettings> {
  const r = await fetch(BASE + '/api/settings');
  if (!r.ok) throw new Error(`settings HTTP ${r.status}`);
  return await r.json();
}

/* 測試「指定」設定的連線（不改後端當前 config）。回傳 {ok, message}。 */
export async function testConnection(
  baseUrl: string, apiKey: string, model: string,
): Promise<{ ok: boolean; message: string }> {
  const r = await fetch(BASE + '/api/settings/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url: baseUrl, api_key: apiKey, model }),
  });
  if (!r.ok) throw new Error(`test HTTP ${r.status}`);
  return await r.json();
}

/* 列出指定 base_url（Ollama）已安裝的真實模型。 */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const r = await fetch(BASE + '/api/settings/models?base_url=' + encodeURIComponent(baseUrl));
  if (!r.ok) throw new Error(`models HTTP ${r.status}`);
  return (await r.json()).models ?? [];
}

/* 把選定的生成模型寫入後端 llm_config（即時生效）。 */
export async function pushLlmConfig(
  provider: string, baseUrl: string, apiKey: string, model: string,
): Promise<void> {
  const r = await fetch(BASE + '/api/settings/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, base_url: baseUrl, api_key: apiKey, model }),
  });
  if (!r.ok) throw new Error(`set llm HTTP ${r.status}`);
}

// ── 知識庫管理（設定頁 kbGroup 接真後端）────────────────────────────────

export interface BackendSource {
  source_id: string; source_name: string; source_type: string;
  chunk_count: number; enabled: boolean; trust_score: number;
}
export interface BackendDoc {
  id: number; filename: string; raw_format: string; fetched_at: string; chunk_count: number;
}

export async function listSources(): Promise<BackendSource[]> {
  const r = await fetch(BASE + '/api/sources');
  if (!r.ok) throw new Error(`sources HTTP ${r.status}`);
  return await r.json();
}

export async function setSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
  const r = await fetch(BASE + '/api/sources/' + encodeURIComponent(sourceId) + '/enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!r.ok) throw new Error(`enabled HTTP ${r.status}`);
}

export async function createKb(name: string): Promise<{ source_id: string; source_name: string }> {
  const r = await fetch(BASE + '/api/kb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(`create kb HTTP ${r.status}`);
  return await r.json();
}

export async function deleteKb(sourceId: string): Promise<void> {
  const r = await fetch(BASE + '/api/kb/' + encodeURIComponent(sourceId), { method: 'DELETE' });
  if (!r.ok) throw new Error(`delete kb HTTP ${r.status}`);
}

export async function listDocs(sourceId: string): Promise<BackendDoc[]> {
  const r = await fetch(BASE + '/api/kb/' + encodeURIComponent(sourceId) + '/documents');
  if (!r.ok) throw new Error(`docs HTTP ${r.status}`);
  return await r.json();
}

/* 上傳文件到知識庫（multipart）。回傳後端 ingest 統計或錯誤訊息。 */
export async function uploadDoc(
  sourceId: string, file: File, chunkSize: number, chunkOverlap: number,
): Promise<{ ok: boolean; message: string }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('chunk_size', String(chunkSize));
  fd.append('chunk_overlap', String(chunkOverlap));
  const r = await fetch(BASE + '/api/kb/' + encodeURIComponent(sourceId) + '/documents', {
    method: 'POST', body: fd,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, message: d.detail || `上傳失敗 HTTP ${r.status}` };
  if (d.skipped) return { ok: false, message: '此檔案已存在（checksum 相同）' };
  return { ok: true, message: `已切成 ${d.chunks_added} 段並索引` };
}

export async function deleteDoc(sourceId: string, docId: number): Promise<void> {
  const r = await fetch(
    BASE + '/api/kb/' + encodeURIComponent(sourceId) + '/documents/' + docId, { method: 'DELETE' },
  );
  if (!r.ok) throw new Error(`delete doc HTTP ${r.status}`);
}

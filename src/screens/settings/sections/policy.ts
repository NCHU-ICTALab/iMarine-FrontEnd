import { getSetting, setSetting } from '../storage';
import { tail4 } from '../renderer';
import {
  createKb, deleteDoc, deleteKb, getBackendSettings, getSchedule, listDocs,
  listOllamaModels, listSources, pushEmbedConfig, pushLlmConfig, reembedAll,
  runNewsRefresh, setSchedule, setSourceEnabled, testConnection, testEmbedding,
  uploadDoc,
} from '../backend';
import type { BackendDoc, BackendSource } from '../backend';
import { bindStrategyBlock, mountMockKb, strategyBlockHtml } from './policy-kb-mock';
import type { SettingGroup, SettingsCtx, SettingsSection } from '../schema';

/* policy 分區：生成接口（llmMode segmented）+ 模型管理（供應商 Setup modal + 系統預設模型）。
   markup/互動逐字對齊 docs/preview/preview-settings.html 的 viewPolicy()（生成接口/模型管理段）
   與 openProv()/modelListHtml()/pm-test/pm-save/pm-remove（Setup modal 全流程）。
   知識庫管理 group 由 Task 7 續加於本檔（policySection.groups 陣列尾端新增一筆）。 */

export interface ProviderCfg {
  id: string;
  name: string;
  urlPh: string; // API URL placeholder
  keyOptional: boolean; // 地端服務可免金鑰
  url: string;
  key: string; // mock 階段明文存 localStorage（demo 假 key）；README 明記真後端 key 只送不回
  connected: boolean;
  models: { id: string; kind: 'chat' | 'embedding' | 'rerank'; enabled: boolean }[];
  catalog?: { id: string; kind: 'chat' | 'embedding' | 'rerank' }[]; // 連線驗證通過後載入的預錄清單
}

export interface PolicyDefaults {
  reasoning: string;
  embedding: string;
  rerank: string;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

export const DEFAULTS_PRESET: PolicyDefaults = { reasoning: 'qwen3:8b', embedding: 'bge-m3', rerank: '' };

export const PROVIDER_PRESET: ProviderCfg[] = [
  {
    id: 'ollama', name: 'Ollama（地端）', urlPh: 'http://localhost:11434', keyOptional: true,
    url: 'http://localhost:11434', key: '', connected: true,
    models: [
      { id: 'qwen3:8b', kind: 'chat', enabled: true },
      { id: 'bge-m3', kind: 'embedding', enabled: true },
      { id: 'bge-reranker-v2', kind: 'rerank', enabled: false },
    ],
  },
  {
    id: 'openai', name: 'OpenAI 相容', urlPh: 'https://api.openai.com/v1', keyOptional: false,
    url: '', key: '', connected: false, models: [],
    catalog: [
      { id: 'gpt-4.1-mini', kind: 'chat' }, { id: 'gpt-4.1', kind: 'chat' },
      { id: 'text-embedding-3-small', kind: 'embedding' },
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', urlPh: 'https://api.anthropic.com', keyOptional: false,
    url: '', key: '', connected: false, models: [],
    catalog: [{ id: 'claude-sonnet-5', kind: 'chat' }, { id: 'claude-haiku-4-5', kind: 'chat' }],
  },
];

/* ---------- 知識庫（Kb） ---------- */
export interface Kb {
  id: string;
  name: string;
  desc?: string;
  docs: { id: string; name: string; status: 'available' | 'indexing' }[];
  chunk: { size: number; overlap: number };
  retrieval: {
    strategy: 'vector' | 'fulltext' | 'hybrid';
    hybridWeight: number;
    rerank: boolean;
    rerankModel: string;
    embeddingModel: string;
  };
}

// preview 的 mkdocs()：id 用 'd'+index+'-'+檔名長度 湊出穩定假 id，逐字沿用同一湊法。
function mkdocs(names: string[]): Kb['docs'] {
  return names.map((n, i) => ({ id: 'd' + i + '-' + n.length, name: n, status: 'available' as const }));
}

export const KB_PRESET: Kb[] = [
  {
    id: 'law', name: '航港法令',
    docs: mkdocs([
      '商港法施行細則.pdf', '航路標識條例.pdf', '船舶法.pdf', '海商法.pdf', '引水法.pdf',
      '商港服務費收取保管辦法.pdf', '航業法.pdf', '船員法.pdf', '港區安全檢查作業.pdf',
      'IMO_NZF_2025.pdf', 'MARPOL附則VI.pdf', 'SOLAS修正案彙編.pdf',
    ]),
    chunk: { size: 512, overlap: 64 },
    retrieval: { strategy: 'hybrid', hybridWeight: 60, rerank: false, rerankModel: '', embeddingModel: 'bge-m3' },
  },
  {
    id: 'news', name: '海運焦點新聞',
    docs: mkdocs([
      '紅海航線中斷追蹤.pdf', '巴拿馬運河配額.pdf', '馬六甲碰撞管制.pdf', '聯盟重組分析.pdf',
      '塞港指數週報.pdf', '運價走勢0630.pdf', '綠色燃料補給網.pdf', '船員短缺調查.pdf', '港口自動化案例.pdf',
    ]),
    chunk: { size: 512, overlap: 64 },
    retrieval: { strategy: 'vector', hybridWeight: 60, rerank: false, rerankModel: '', embeddingModel: 'bge-m3' },
  },
  {
    id: 'idx', name: '全球航運指數',
    docs: mkdocs([
      'SCFI週資料.csv', 'CCFI月報.pdf', 'BDI日更彙整.csv', 'WCI貨櫃運價.pdf',
      '港口壅塞指數.csv', '燃油價格追蹤.csv', '汰舊換新統計.pdf',
    ]),
    chunk: { size: 256, overlap: 32 },
    retrieval: { strategy: 'vector', hybridWeight: 60, rerank: false, rerankModel: '', embeddingModel: 'bge-m3' },
  },
  {
    id: 'tw', name: '台灣數據統計',
    docs: mkdocs([
      '高雄港年報2025.pdf', '進出港船舶統計.csv', '貨物吞吐量月報.csv', '散雜貨作業統計.pdf',
      '港勤船調度紀錄.csv', '氣象觀測彙整.csv', '危險品申報統計.pdf', '岸電使用率.csv',
    ]),
    chunk: { size: 512, overlap: 64 },
    retrieval: { strategy: 'fulltext', hybridWeight: 60, rerank: false, rerankModel: '', embeddingModel: 'bge-m3' },
  },
  {
    id: 'alt', name: '替代能源專區',
    docs: mkdocs([
      '甲醇動力船隊盤點.pdf', '氨燃料安全指引.pdf', '岸電設施規範.pdf',
      '綠色航運走廊MOU.pdf', '碳強度指標CII.pdf', '生質燃料試航報告.pdf',
    ]),
    chunk: { size: 512, overlap: 64 },
    retrieval: { strategy: 'vector', hybridWeight: 60, rerank: false, rerankModel: '', embeddingModel: 'bge-m3' },
  },
];

export function getKbs(): Kb[] {
  // getSetting() 找不到 key 時直接回傳 fallback 參照本身（storage.ts 未深拷貝 fallback）。
  // 本 group 會就地改動取回的陣列/其內物件（nk-create 的 kbs.push、kb-save 的
  // kbCur.chunk=…、doc 刪除的 kbCur.docs=…），若 fallback 直接傳 KB_PRESET，首次讀取（storage
  // 尚無 'policy.kbs' key）會把改動一路寫回 KB_PRESET 這個 module 常數本身，之後「重置為預設」
  // 會複製到已被污染的 KB_PRESET，永久失效。故 fallback 一律先深拷貝一份，切斷共享參照。
  return getSetting<Kb[]>('policy.kbs', JSON.parse(JSON.stringify(KB_PRESET)));
}
export function setKbs(list: Kb[]): void {
  setSetting('policy.kbs', list);
}

export function getProviders(): ProviderCfg[] {
  // fallback 深拷貝：與 getKbs() 同因——getSetting 找不到 key 時直接回傳 fallback 參照本身。
  // saveBtn 處理內 `const list = getProviders(); list.push/替換; setProviders(list)` 會就地改動
  // 取回的陣列；若首次讀取（'policy.providers' 尚未寫入 storage）直接傳 PROVIDER_PRESET，就地
  // push/覆寫會污染 export 常數本身（Ollama 預設 connected:true，點開 Ollama 卡直接儲存即觸發）。
  // 故 fallback 先深拷貝切斷共享參照。
  return getSetting<ProviderCfg[]>('policy.providers', JSON.parse(JSON.stringify(PROVIDER_PRESET)));
}
function setProviders(list: ProviderCfg[]): void {
  setSetting('policy.providers', list);
}
export function getDefaults(): PolicyDefaults {
  // fallback 深拷貝：與 getKbs()/getProviders() 同因——getSetting 找不到 key 時直接回傳
  // fallback 參照本身。系統預設模型 select 的 change 監聽與移除供應商流程都會就地改動
  // 取回的物件（d[key]=...），首次讀取直接傳 DEFAULTS_PRESET 會污染 export 常數本身。
  return getSetting<PolicyDefaults>('policy.defaults', JSON.parse(JSON.stringify(DEFAULTS_PRESET)));
}
export function connectedModels(kind: 'chat' | 'embedding' | 'rerank'): string[] {
  const out: string[] = [];
  getProviders().forEach((p) => {
    if (!p.connected) return;
    p.models.forEach((m) => { if (m.enabled && m.kind === kind) out.push(m.id); });
  });
  return out;
}

/* 供應商 URL → 後端可用的 OpenAI 相容 base（Ollama 補 /v1；已含 /vN 則原樣）。 */
export function openaiBase(p: ProviderCfg): string {
  const u = p.url.replace(/\/+$/, '');
  if (/\/v\d+$/.test(u)) return u;
  if (p.keyOptional || /:11434(\/|$)/.test(u)) return u + '/v1';
  return u;
}

/* 依「地端/雲端」把對應供應商的 chat 模型真的 push 到後端（切換生成模型）。
   地端＝已連線且免金鑰（Ollama 類，push 前先探測可達性，避免指到沒開的服務）；
   雲端＝已連線且需金鑰。回傳 {ok,message}；ok=false 時後端維持原設定，呼叫端據此還原 toggle。 */
export async function applyLlmMode(
  mode: 'local' | 'cloud',
): Promise<{ ok: boolean; message: string }> {
  const prov = getProviders().find(
    (p) => p.connected && (mode === 'local' ? p.keyOptional : !p.keyOptional),
  );
  const model = prov?.models.find((m) => m.enabled && m.kind === 'chat')?.id;
  if (!prov || !model) {
    return { ok: false, message: mode === 'local' ? '尚未設定地端供應商' : '尚未設定雲端供應商' };
  }
  const base = openaiBase(prov);
  if (mode === 'local') {
    try {
      const ms = await listOllamaModels(base);
      if (!ms.length) throw new Error('no models');
    } catch {
      return { ok: false, message: `地端服務未連線（${base}），後端維持原設定` };
    }
  }
  try {
    await pushLlmConfig(prov.name, base, prov.key, model);
    const d = getDefaults(); d.reasoning = model; setSetting('policy.defaults', d);
    return { ok: true, message: `已切換至${mode === 'local' ? '地端' : '雲端'}：${model}` };
  } catch {
    return { ok: false, message: '後端未連線，無法切換' };
  }
}

/* 把「系統預設推理模型」+ 其所屬供應商寫入後端 llm_config（後端不在則靜默略過）。 */
export async function syncLlmToBackend(): Promise<void> {
  const model = getDefaults().reasoning;
  if (!model) return;
  const prov = getProviders().find(
    (p) => p.connected && p.models.some((m) => m.enabled && m.kind === 'chat' && m.id === model),
  );
  if (!prov) return;
  try {
    await pushLlmConfig(prov.name, openaiBase(prov), prov.key, model);
  } catch { /* 後端未啟動，維持 UI 設定 */ }
}

/* ---------- 生成接口 group（instant segmented） ---------- */
function llmGroup(): SettingGroup {
  return {
    title: '生成接口',
    badge: '即時生效 · 與政策頁同步',
    badgeTone: 'live',
    saveMode: 'instant',
    custom(el, ctx: SettingsCtx) {
      const cur = getSetting<'local' | 'cloud'>('policy.llmMode', 'local');
      el.innerHTML =
        '<div class="frow"><div class="flabel">LLM 接口<span class="help">政策頁標題列的切換器與此雙向同步；切換即改後端生成模型</span></div>' +
        '<div class="fctl"><div class="seg" id="pol-llmseg">' +
        '<button type="button" data-llm="local" class="' + (cur === 'local' ? 'on' : '') + '">地端部署</button>' +
        '<button type="button" data-llm="cloud" class="' + (cur === 'cloud' ? 'on' : '') + '">雲端 API</button>' +
        '</div><span class="flash" data-flash="llm">✓ 已生效</span></div></div>';
      const seg = el.querySelector('#pol-llmseg') as HTMLElement;
      seg.addEventListener('click', async (e) => {
        const b = (e.target as HTMLElement).closest('[data-llm]') as HTMLButtonElement | null;
        if (!b) return;
        const v = b.getAttribute('data-llm') as 'local' | 'cloud';
        const prev = getSetting<'local' | 'cloud'>('policy.llmMode', 'local');
        if (v === prev) return;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); // 樂觀切換
        const res = await applyLlmMode(v);                    // 真的 push 後端生成模型
        if (res.ok) {
          setSetting('policy.llmMode', v);
          const fl = el.querySelector('[data-flash="llm"]');
          if (fl) { fl.classList.add('show'); setTimeout(() => fl.classList.remove('show'), 1400); }
          ctx.toast({ title: '已切換生成接口', message: res.message, duration: 2600 });
        } else {
          // 切換失敗（供應商未設定/未連線）→ 還原視覺，後端維持原設定
          seg.querySelectorAll('button').forEach((x) =>
            x.classList.toggle('on', x.getAttribute('data-llm') === prev));
          ctx.toast({ title: '無法切換接口', message: res.message, duration: 3400 });
        }
      });
    },
  };
}

/* ---------- 模型管理 group（供應商卡牆 + Setup modal + 系統預設模型） ---------- */
function modelListHtml(models: ProviderCfg['models']): string {
  return (
    '<div class="msec">模型（勾選以啟用）</div>' +
    models.map((m, i) =>
      '<div class="mdlrow"><label><input type="checkbox" data-mdl="' + i + '"' + (m.enabled ? ' checked' : '') + '>' +
      esc(m.id) + '</label>' +
      '<span class="kind' + (m.kind === 'embedding' ? ' emb' : m.kind === 'rerank' ? ' rr' : '') + '">' + m.kind + '</span></div>',
    ).join('')
  );
}

function pmodalHtml(): string {
  return (
    '<div class="mwrap" id="pmodal"><div class="mbox">' +
    '<div class="mhead"><h3 id="pm-title">設定供應商</h3><span class="sp"></span>' +
    '<button type="button" class="mclose" id="pm-close">×</button></div>' +
    '<div class="frow"><div class="flabel">API URL</div>' +
    '<div class="fctl"><input class="tin" id="pm-url" placeholder="https://api.example.com/v1"></div></div>' +
    '<div class="frow"><div class="flabel">API KEY<span class="help" id="pm-keyhelp"></span></div>' +
    '<div class="fctl"><input class="tin" id="pm-key" type="password" placeholder="sk-...">' +
    '<button type="button" class="eyebtn" id="pm-eye">顯示</button></div></div>' +
    '<div class="frow"><div class="flabel">模型 id<span class="help" id="pm-modelhelp"></span></div>' +
    '<div class="fctl"><input class="tin" id="pm-model" placeholder="例：gemma-4-31B-it"></div></div>' +
    '<div class="frow"><div class="flabel">連線驗證</div>' +
    '<div class="fctl"><button type="button" class="mini acc" id="pm-test">測試連線</button>' +
    '<div class="tstate" id="pm-state"></div></div></div>' +
    '<div id="pm-models"></div>' +
    '<div class="savebar show" style="background:transparent;border-color:rgba(255,255,255,.1);color:var(--ink60)">' +
    '<span id="pm-hint">通過連線驗證後可儲存</span><span class="sp"></span>' +
    '<button type="button" class="mini danger" id="pm-remove" style="display:none">移除供應商</button>' +
    '<button type="button" class="mini acc" id="pm-save" disabled>儲存</button>' +
    '</div></div></div>'
  );
}

function modelGroup(): SettingGroup {
  return {
    title: '模型管理',
    saveMode: 'instant',
    custom(el, ctx: SettingsCtx) {
      let pmProv: ProviderCfg | null = null;
      let pmTestedModels: ProviderCfg['models'] | null = null;
      // Escape 關閉需生命週期綁在 document（modal 開啟時才有 focus 落在 pcard 上，
      // .pcard 無 tabindex，activeElement 停在 body，keydown 冒泡到 document 而非 el，
      // 故不能綁在 el 上）；開 modal 時掛、關 modal 時卸，避免每次開合疊加監聽。
      let escOff: (() => void) | null = null;

      const providers = getProviders();

      // 動態「n/m 已連線」badge：schema 的 g.badge 為靜態字串無法反映即時連線數，
      // 故不設 g.badge，改在 custom 執行當下手動掛到 ghead（每次 renderGroup 都會重建 ghead，無重複風險）。
      const card = el.parentElement;
      const ghead = card?.querySelector('.ghead');
      if (ghead && !ghead.querySelector('.gbadge')) {
        const badge = document.createElement('span');
        badge.className = 'gbadge live';
        badge.textContent = providers.filter((p) => p.connected).length + '/' + providers.length + ' 已連線';
        ghead.insertBefore(badge, ghead.querySelector('.sp'));
      }

      const defaults = getDefaults();
      const chat = connectedModels('chat');
      const emb = connectedModels('embedding');
      const rr = connectedModels('rerank');
      const selOpts = (list: string[], cur: string) =>
        list.map((m) => '<option value="' + esc(m) + '"' + (m === cur ? ' selected' : '') + '>' + esc(m) + '</option>').join('');

      el.innerHTML =
        '<div class="pgrid">' +
        providers.map((p) =>
          '<div class="pcard' + (p.connected ? ' ok' : '') + '" data-prov="' + esc(p.id) + '">' +
          '<b>' + esc(p.name) + '</b>' +
          '<span class="meta">' + (p.connected ? (p.keyOptional && !p.key ? '免金鑰（地端）' : esc(tail4(p.key))) : '未設定') + '</span>' +
          '<span class="stt"><span class="lamp"></span>' +
          (p.connected ? '已連線 · ' + p.models.filter((m) => m.enabled).length + ' 模型' : 'Setup') +
          '</span></div>',
        ).join('') +
        '<div class="pcard addc" data-prov="__new">+ 自訂供應商</div>' +
        '</div>' +
        '<div class="msec">系統預設模型</div>' +
        '<div class="frow"><div class="flabel">推理模型</div><div class="fctl">' +
        '<select class="sel" data-def="reasoning"' + (chat.length ? '' : ' disabled') + '>' + selOpts(chat, defaults.reasoning) + '</select>' +
        (chat.length ? '' : '<span class="guide">請先設定至少一個供應商</span>') +
        '<span class="flash" data-flash="def">✓ 已生效</span></div></div>' +
        '<div class="frow"><div class="flabel">Embedding 模型</div><div class="fctl">' +
        '<select class="sel" data-def="embedding"' + (emb.length ? '' : ' disabled') + '>' + selOpts(emb, defaults.embedding) + '</select>' +
        (emb.length ? '' : '<span class="guide">請先設定至少一個供應商</span>') + '</div></div>' +
        '<div class="frow"><div class="flabel">Rerank 模型</div><div class="fctl">' +
        '<select class="sel" data-def="rerank"' + (rr.length ? '' : ' disabled') + '>' +
        '<option value="">未設定</option>' + selOpts(rr, defaults.rerank) + '</select>' +
        (rr.length ? '' : '<span class="guide">尚無已啟用的 rerank 模型（至供應商卡啟用）</span>') + '</div></div>' +
        pmodalHtml();

      el.querySelectorAll<HTMLSelectElement>('[data-def]').forEach((s) => {
        s.addEventListener('change', () => {
          const key = s.getAttribute('data-def') as keyof PolicyDefaults;
          const d = getDefaults();
          d[key] = s.value;
          setSetting('policy.defaults', d);
          if (key === 'reasoning') void syncLlmToBackend();  // 推理模型 → 後端 llm_config
          const fl = el.querySelector('[data-flash="def"]');
          if (fl) {
            fl.classList.add('show');
            setTimeout(() => fl.classList.remove('show'), 1400);
          }
        });
      });

      el.querySelectorAll<HTMLElement>('[data-prov]').forEach((c) => {
        c.addEventListener('click', () => openProv(c.getAttribute('data-prov') as string));
      });

      function openProv(id: string): void {
        if (id === '__new') {
          pmProv = {
            id: 'custom-' + Date.now(),
            name: '自訂供應商',
            urlPh: 'https://api.example.com/v1',
            keyOptional: false,
            url: '', key: '', connected: false, models: [],
            catalog: [
              { id: 'custom-chat-model', kind: 'chat' },
              { id: 'custom-embed-model', kind: 'embedding' },
              { id: 'custom-rerank-model', kind: 'rerank' },
            ],
          };
        } else {
          const found = getProviders().find((p) => p.id === id);
          if (!found) return;
          pmProv = JSON.parse(JSON.stringify(found)) as ProviderCfg; // 工作副本；儲存時整批寫回
        }
        pmTestedModels = null;
        const wrap = el.querySelector('#pmodal') as HTMLElement;
        (wrap.querySelector('#pm-title') as HTMLElement).textContent =
          (pmProv.connected ? '管理供應商 — ' : '設定供應商 — ') + pmProv.name;
        const urlIn = wrap.querySelector('#pm-url') as HTMLInputElement;
        urlIn.value = pmProv.url || '';
        urlIn.placeholder = pmProv.urlPh;
        const keyIn = wrap.querySelector('#pm-key') as HTMLInputElement;
        keyIn.value = '';
        keyIn.type = 'password';
        (wrap.querySelector('#pm-eye') as HTMLElement).textContent = '顯示';
        keyIn.placeholder = pmProv.connected && pmProv.key
          ? '已儲存（' + tail4(pmProv.key) + '）— 輸入以更換'
          : (pmProv.keyOptional ? '地端可留空' : 'sk-...');
        (wrap.querySelector('#pm-keyhelp') as HTMLElement).textContent = pmProv.keyOptional ? '地端服務可留空' : '';
        const modelIn = wrap.querySelector('#pm-model') as HTMLInputElement;
        modelIn.value = pmProv.models.find((m) => m.kind === 'chat' && m.enabled)?.id
          ?? pmProv.models.find((m) => m.kind === 'chat')?.id ?? '';
        modelIn.placeholder = pmProv.keyOptional ? '留空＝連線後自動載入 Ollama 模型' : '例：gemma-4-31B-it';
        (wrap.querySelector('#pm-modelhelp') as HTMLElement).textContent =
          pmProv.keyOptional ? '地端可留空' : '雲端請填實際模型名';
        const stateEl = wrap.querySelector('#pm-state') as HTMLElement;
        stateEl.className = 'tstate';
        stateEl.textContent = '';
        (wrap.querySelector('#pm-models') as HTMLElement).innerHTML = pmProv.connected ? modelListHtml(pmProv.models) : '';
        (wrap.querySelector('#pm-save') as HTMLButtonElement).disabled = !pmProv.connected;
        (wrap.querySelector('#pm-hint') as HTMLElement).textContent = pmProv.connected ? '' : '通過連線驗證後可儲存';
        (wrap.querySelector('#pm-remove') as HTMLElement).style.display =
          pmProv.connected && id !== '__new' ? '' : 'none';
        wrap.classList.add('open');
        // Escape 監聽掛在 document（非 el）：pcard 無 tabindex，開 modal 後 focus 停在
        // body，keydown 從 body 冒泡到 document 不會經過 el。開一次掛一次、關一次卸一次，
        // 若前一個尚未卸除（理論上不會發生）先卸再掛，避免殘留疊加。
        if (escOff) { escOff(); escOff = null; }
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
        document.addEventListener('keydown', onEsc);
        escOff = () => document.removeEventListener('keydown', onEsc);
      }

      // Setup modal 靜態元件（測試連線/儲存/移除/眼睛/勾選/關閉）只綁一次：
      // custom() 本身每次分區重渲染才會重跑一次（不會在單次開合 modal 期間重複呼叫），
      // 故此處綁定不會造成重複監聽。Escape 例外——見 openProv/closeModal 內的 document 監聽。
      const wrap = el.querySelector('#pmodal') as HTMLElement;
      const urlIn = wrap.querySelector('#pm-url') as HTMLInputElement;
      const keyIn = wrap.querySelector('#pm-key') as HTMLInputElement;
      const eyeBtn = wrap.querySelector('#pm-eye') as HTMLButtonElement;
      const testBtn = wrap.querySelector('#pm-test') as HTMLButtonElement;
      const stateEl = wrap.querySelector('#pm-state') as HTMLElement;
      const modelsEl = wrap.querySelector('#pm-models') as HTMLElement;
      const saveBtn = wrap.querySelector('#pm-save') as HTMLButtonElement;
      const removeBtn = wrap.querySelector('#pm-remove') as HTMLButtonElement;
      const hintEl = wrap.querySelector('#pm-hint') as HTMLElement;

      const closeModal = () => {
        wrap.classList.remove('open');
        if (escOff) { escOff(); escOff = null; }
      };
      (wrap.querySelector('#pm-close') as HTMLElement).addEventListener('click', closeModal);
      wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });

      eyeBtn.addEventListener('click', () => {
        keyIn.type = keyIn.type === 'password' ? 'text' : 'password';
        eyeBtn.textContent = keyIn.type === 'password' ? '顯示' : '隱藏';
      });

      testBtn.addEventListener('click', async () => {
        if (!pmProv) return;
        const prov = pmProv;
        const url = urlIn.value.trim();
        const key = keyIn.value.trim();
        if (!/^https?:\/\/.+/.test(url)) {
          stateEl.className = 'tstate err';
          stateEl.textContent = '✗ API URL 格式不正確';
          return;
        }
        const effKey = key || (prov.connected ? prov.key : '');
        if (!effKey && !prov.keyOptional) {
          stateEl.className = 'tstate err';
          stateEl.textContent = '✗ 需要 API KEY';
          return;
        }
        stateEl.className = 'tstate run';
        stateEl.innerHTML = '<span class="spin"></span>驗證中…';
        const u = url.replace(/\/+$/, '');
        const isOllama = prov.keyOptional || /:11434(\/|$)/.test(u);
        const base = /\/v\d+$/.test(u) ? u : (isOllama ? u + '/v1' : u);
        try {
          if (isOllama) {
            // Ollama：列出真實已安裝模型即為連線驗證
            const ms = await listOllamaModels(base);
            if (!ms.length) throw new Error('no models');
            pmTestedModels = ms.map((id, i) => ({ id, kind: 'chat' as const, enabled: i === 0 }));
            stateEl.className = 'tstate ok';
            stateEl.textContent = '✓ 已連線 · 載入 ' + ms.length + ' 個模型';
          } else {
            const modelId = (wrap.querySelector('#pm-model') as HTMLInputElement).value.trim();
            const testModel = modelId || (prov.catalog ?? []).find((m) => m.kind === 'chat')?.id;
            if (!testModel) {
              stateEl.className = 'tstate err';
              stateEl.textContent = '✗ 請輸入模型 id';
              return;
            }
            const res = await testConnection(base, effKey, testModel);
            if (!res.ok) throw new Error(res.message);
            // 有填模型 id → 以該模型為唯一 chat 模型；否則沿用預錄 catalog
            pmTestedModels = modelId
              ? [{ id: modelId, kind: 'chat', enabled: true }]
              : (prov.models.length ? prov.models : (prov.catalog ?? []).map((m) => ({ ...m, enabled: m.kind === 'chat' })));
            stateEl.className = 'tstate ok';
            stateEl.textContent = '✓ ' + res.message.slice(0, 40);
          }
          modelsEl.innerHTML = modelListHtml(pmTestedModels);
          saveBtn.disabled = false;
          hintEl.textContent = '';
        } catch (err) {
          // 後端沒開（Failed to fetch / no models）→ 退回示範驗證，demo 不跳紅字（spec §3.2）；
          // 後端有回但錯（429 限流 / 404 模型 / embedding 非 chat…）→ 顯示分類訊息。
          const msg = err instanceof Error ? err.message : '';
          const offline = /failed to fetch|networkerror|no models/i.test(msg);
          if (offline) {
            pmTestedModels = prov.models.length
              ? prov.models
              : (prov.catalog ?? []).map((m) => ({ ...m, enabled: m.kind === 'chat' }));
            stateEl.className = 'tstate ok';
            stateEl.textContent = '✓ 驗證通過（示範）· 已載入 ' + pmTestedModels.length + ' 個模型';
            modelsEl.innerHTML = modelListHtml(pmTestedModels);
            saveBtn.disabled = false;
            hintEl.textContent = '';
          } else {
            stateEl.className = 'tstate err';
            stateEl.textContent = '✗ ' + (msg || '連線失敗（確認後端 :8100 是否啟動）');
          }
        }
      });

      modelsEl.addEventListener('change', (e) => {
        const t = e.target as HTMLInputElement;
        const i = t.getAttribute('data-mdl');
        if (i === null || !pmProv) return;
        const list = pmTestedModels ?? pmProv.models;
        list[Number(i)].enabled = t.checked;
      });

      saveBtn.addEventListener('click', () => {
        if (!pmProv || saveBtn.disabled) return;
        const prov = pmProv;
        const urlV = urlIn.value.trim();
        if (urlV) prov.url = urlV;
        const keyV = keyIn.value.trim();
        if (keyV) prov.key = keyV;
        if (pmTestedModels) prov.models = pmTestedModels;
        prov.connected = true;
        const list = getProviders();
        const idx = list.findIndex((p) => p.id === prov.id);
        if (idx >= 0) list[idx] = prov; else list.push(prov);
        setProviders(list);
        // 自動把剛連上的 chat 模型設為系統預設推理模型，確保 syncLlmToBackend push 的是它
        const chatModel = prov.models.find((m) => m.enabled && m.kind === 'chat')?.id;
        if (chatModel) {
          const d = getDefaults(); d.reasoning = chatModel; setSetting('policy.defaults', d);
        }
        void syncLlmToBackend();   // 供應商 url/key/模型變更 → 同步後端 llm_config
        closeModal();
        ctx.rerender();
      });

      removeBtn.addEventListener('click', () => {
        if (!pmProv) return;
        const prov = pmProv;
        if (!confirm('移除供應商「' + prov.name + '」？其模型將自可選清單消失')) return;
        setProviders(getProviders().filter((p) => p.id !== prov.id));
        const d = getDefaults();
        (['reasoning', 'embedding', 'rerank'] as const).forEach((k) => {
          const pool = connectedModels(k === 'reasoning' ? 'chat' : k);
          if (!pool.includes(d[k])) d[k] = pool[0] ?? '';
        });
        setSetting('policy.defaults', d);
        closeModal();
        ctx.rerender();
      });
    },
  };
}

/* ---------- 知識庫管理 group（卡牆 + KB modal + 新增庫 modal） ---------- */
function docsListHtml(docs: BackendDoc[]): string {
  if (!docs.length) return '<div class="gnote">尚無文件 — 由下方上傳。</div>';
  return docs.map((d) =>
    '<div class="docrow"><span class="fn">' + esc(d.filename) + '</span>' +
    '<span class="stat ok">' + d.chunk_count + ' 段</span>' +
    '<button type="button" class="rm" data-rmdoc="' + d.id + '" title="刪除">×</button></div>',
  ).join('');
}

function kbModalHtml(): string {
  return (
    '<div class="mwrap" id="kbmodal"><div class="mbox wide">' +
    '<div class="mhead"><h3 id="kb-title">知識庫</h3><span class="sp"></span>' +
    '<button type="button" class="mclose" id="kb-close">×</button></div>' +
    '<div class="msec">文件</div><div id="kb-docs"></div>' +
    '<div class="drop" id="kb-drop">拖放或點擊上傳文件（TXT / MD / PDF / DOCX）</div>' +
    '<input type="file" id="kb-file" accept=".txt,.md,.pdf,.docx" multiple style="display:none">' +
    '<div class="kbup" id="kb-upstate"></div>' +
    '<div class="msec">分段參數（上傳時套用）</div>' +
    '<div class="frow"><div class="flabel">Chunk 長度<span class="help">tokens</span></div>' +
    '<div class="fctl"><input class="tin num" id="kb-chunk" type="number" min="64" max="4096" step="64" value="512"></div></div>' +
    '<div class="frow"><div class="flabel">Chunk 重疊<span class="help">tokens</span></div>' +
    '<div class="fctl"><input class="tin num" id="kb-overlap" type="number" min="0" max="1024" step="16" value="64"></div></div>' +
    strategyBlockHtml() +
    '</div></div>'
  );
}

function nkModalHtml(): string {
  return (
    '<div class="mwrap" id="nkmodal"><div class="mbox" style="width:440px">' +
    '<div class="mhead"><h3>新增知識庫</h3><span class="sp"></span>' +
    '<button type="button" class="mclose" id="nk-close">×</button></div>' +
    '<div class="frow"><div class="flabel">名稱</div>' +
    '<div class="fctl"><input class="tin" id="nk-name" placeholder="例：綠色航運政策"></div></div>' +
    '<div class="savebar show" style="background:transparent;border-color:rgba(255,255,255,.1);color:var(--ink60)">' +
    '<span></span><span class="sp"></span><button type="button" class="mini acc" id="nk-create">建立</button></div>' +
    '</div></div>'
  );
}

/* 知識庫管理接真後端：列出 /api/sources、啟用停用、建/刪庫、上傳/列/刪文件。
   後端不在時顯示提示（mock 資料層 KB_PRESET/getKbs 保留供 preset 契約測試，不在此使用）。 */
function kbGroup(): SettingGroup {
  return {
    title: '知識庫管理',
    saveMode: 'instant',
    custom(el, ctx: SettingsCtx) {
      let sources: BackendSource[] = [];
      let curKb: BackendSource | null = null;
      let escOffKb: (() => void) | null = null;
      let escOffNk: (() => void) | null = null;

      el.innerHTML =
        '<div class="kbgrid" id="kbgrid"><div class="gnote">載入知識庫…</div></div>' +
        '<div class="gnote">上傳文件即時切段與索引；停用的知識庫不進檢索。自建知識庫可刪除。</div>' +
        kbModalHtml() + nkModalHtml();

      const grid = el.querySelector('#kbgrid') as HTMLElement;
      const ghead = el.parentElement?.querySelector('.ghead');
      const kbWrap = el.querySelector('#kbmodal') as HTMLElement;
      const kbTitle = kbWrap.querySelector('#kb-title') as HTMLElement;
      const kbDocsEl = kbWrap.querySelector('#kb-docs') as HTMLElement;
      const kbDropEl = kbWrap.querySelector('#kb-drop') as HTMLElement;
      const kbFileEl = kbWrap.querySelector('#kb-file') as HTMLInputElement;
      const kbChunkIn = kbWrap.querySelector('#kb-chunk') as HTMLInputElement;
      const kbOverlapIn = kbWrap.querySelector('#kb-overlap') as HTMLInputElement;
      const kbUpState = kbWrap.querySelector('#kb-upstate') as HTMLElement;
      const kbStrat = bindStrategyBlock(kbWrap, ctx);
      const nkWrap = el.querySelector('#nkmodal') as HTMLElement;
      const nkNameIn = nkWrap.querySelector('#nk-name') as HTMLInputElement;

      function updateBadge(): void {
        if (!ghead) return;
        let b = ghead.querySelector('.gbadge') as HTMLElement | null;
        if (!b) {
          b = document.createElement('span');
          b.className = 'gbadge blue';
          ghead.insertBefore(b, ghead.querySelector('.sp'));
        }
        const segs = sources.reduce((a, s) => a + s.chunk_count, 0);
        b.textContent = sources.length + ' 庫 · ' + segs + ' 段';
      }

      async function refresh(initial = false): Promise<void> {
        try {
          sources = await listSources();
        } catch {
          if (initial) { mountMockKb(el, ctx); return; } // 後端不在 → 整組退回 mock 示範（spec §3.1）
          grid.innerHTML =
            '<div class="gnote">後端未連線（VITE_POLICY_API 指定的 rag-agent），無法載入知識庫。</div>';
          return;
        }
        updateBadge();
        renderGrid();
      }

      function renderGrid(): void {
        grid.innerHTML = sources.map((s) =>
          '<div class="kbcard' + (s.enabled ? '' : ' off') + '" data-kb="' + esc(s.source_id) + '">' +
          '<b>' + esc(s.source_name) + '</b>' +
          '<span class="meta">' + s.chunk_count + ' 段 · ' + esc(s.source_type) + '</span>' +
          '<label class="kbtgl"><input type="checkbox" class="kben"' + (s.enabled ? ' checked' : '') + '>啟用</label>' +
          (s.source_type === 'uploaded'
            ? '<span class="del" data-delkb="' + esc(s.source_id) + '" title="刪除知識庫">×</span>' : '') +
          '</div>',
        ).join('') + '<div class="kbcard addc" id="kb-add">+ 新增知識庫</div>';

        grid.querySelectorAll<HTMLElement>('.kbcard[data-kb]').forEach((c) => {
          c.addEventListener('click', (e) => {
            const t = e.target as HTMLElement;
            if (t.closest('.kbtgl') || t.closest('[data-delkb]')) return;
            void openKb(c.getAttribute('data-kb')!);
          });
        });
        grid.querySelectorAll<HTMLInputElement>('.kben').forEach((chk) => {
          chk.addEventListener('change', async () => {
            const sid = (chk.closest('[data-kb]') as HTMLElement).getAttribute('data-kb')!;
            const s = sources.find((x) => x.source_id === sid);
            if (s) s.enabled = chk.checked;
            try {
              await setSourceEnabled(sid, chk.checked);
            } catch {
              chk.checked = !chk.checked;
              if (s) s.enabled = chk.checked;
            }
          });
        });
        grid.querySelectorAll<HTMLElement>('[data-delkb]').forEach((d) => {
          d.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sid = d.getAttribute('data-delkb')!;
            const s = sources.find((x) => x.source_id === sid);
            if (!confirm('刪除知識庫「' + (s?.source_name ?? sid) + '」？其文件與 chunk 將一併移除')) return;
            try { await deleteKb(sid); await refresh(); } catch { alert('刪除失敗（後端未連線）'); }
          });
        });
        (grid.querySelector('#kb-add') as HTMLElement).addEventListener('click', openNk);
      }

      function closeKb(): void {
        kbWrap.classList.remove('open');
        if (escOffKb) { escOffKb(); escOffKb = null; }
      }
      async function renderDocs(): Promise<void> {
        if (!curKb) return;
        try {
          kbDocsEl.innerHTML = docsListHtml(await listDocs(curKb.source_id));
        } catch {
          kbDocsEl.innerHTML = '<div class="gnote">無法載入文件（後端未連線）。</div>';
        }
      }
      async function openKb(sid: string): Promise<void> {
        const s = sources.find((x) => x.source_id === sid);
        if (!s) return;
        curKb = s;
        kbTitle.textContent = '知識庫 — ' + s.source_name;
        kbUpState.textContent = '';
        kbStrat.load(s.source_id);   // 檢索策略區塊載入本機參數（存而不用，spec §3.3）
        kbDocsEl.innerHTML = '<div class="gnote">載入文件…</div>';
        kbWrap.classList.add('open');
        if (escOffKb) { escOffKb(); escOffKb = null; }
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeKb(); };
        document.addEventListener('keydown', onEsc);
        escOffKb = () => document.removeEventListener('keydown', onEsc);
        await renderDocs();
      }

      (kbWrap.querySelector('#kb-close') as HTMLElement).addEventListener('click', closeKb);
      kbWrap.addEventListener('click', (e) => { if (e.target === kbWrap) closeKb(); });
      kbDropEl.addEventListener('click', () => kbFileEl.click());
      kbDocsEl.addEventListener('click', async (e) => {
        const rm = (e.target as HTMLElement).closest('[data-rmdoc]') as HTMLElement | null;
        if (!rm || !curKb) return;
        if (!confirm('刪除此文件及其 chunk？')) return;
        try {
          await deleteDoc(curKb.source_id, Number(rm.getAttribute('data-rmdoc')));
          await renderDocs();
          await refresh();
        } catch { alert('刪除失敗'); }
      });
      kbFileEl.addEventListener('change', async () => {
        if (!curKb) return;
        const files = Array.from(kbFileEl.files ?? []);
        kbFileEl.value = '';
        if (!files.length) return;
        const size = Number(kbChunkIn.value) || 512;
        const overlap = Number(kbOverlapIn.value) || 64;
        for (const f of files) {
          kbUpState.textContent = '上傳中：' + f.name + ' …';
          const res = await uploadDoc(curKb.source_id, f, size, overlap);
          kbUpState.textContent = (res.ok ? '✓ ' : '✗ ') + f.name + '：' + res.message;
        }
        await renderDocs();
        await refresh();
      });

      function closeNk(): void {
        nkWrap.classList.remove('open');
        if (escOffNk) { escOffNk(); escOffNk = null; }
      }
      function openNk(): void {
        nkNameIn.value = '';
        nkWrap.classList.add('open');
        if (escOffNk) { escOffNk(); escOffNk = null; }
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNk(); };
        document.addEventListener('keydown', onEsc);
        escOffNk = () => document.removeEventListener('keydown', onEsc);
      }
      (nkWrap.querySelector('#nk-close') as HTMLElement).addEventListener('click', closeNk);
      nkWrap.addEventListener('click', (e) => { if (e.target === nkWrap) closeNk(); });
      (nkWrap.querySelector('#nk-create') as HTMLElement).addEventListener('click', async () => {
        const name = nkNameIn.value.trim();
        if (!name) { nkNameIn.focus(); return; }
        try { await createKb(name); closeNk(); await refresh(); } catch { alert('建立失敗（後端未連線）'); }
      });

      void refresh(true);
    },
  };
}

/* ---------- Embedding 模型 group（接後端 /api/settings/embed(+test) 與 /reembed） ---------- */
function embeddingGroup(): SettingGroup {
  return {
    title: 'Embedding 模型',
    badge: '向量化',
    badgeTone: 'live',
    saveMode: 'instant',
    custom(el, ctx: SettingsCtx) {
      el.innerHTML =
        '<div class="frow"><div class="flabel">後端<span class="help">雲端 API 或地端本地模型</span></div>' +
        '<div class="fctl"><div class="seg" id="emb-seg">' +
        '<button type="button" data-eb="api">雲端 API</button>' +
        '<button type="button" data-eb="local">地端（本地）</button></div></div></div>' +
        '<div class="frow"><div class="flabel">模型 id</div>' +
        '<div class="fctl"><input class="tin" id="emb-model" placeholder="例：bge-m3"></div></div>' +
        '<div class="frow emb-api"><div class="flabel">API URL</div>' +
        '<div class="fctl"><input class="tin" id="emb-url" placeholder="https://.../v1"></div></div>' +
        '<div class="frow emb-api"><div class="flabel">API KEY</div>' +
        '<div class="fctl"><input class="tin" id="emb-key" type="password" placeholder="sk-...（留空＝沿用現有）"></div></div>' +
        '<div class="frow"><div class="flabel">連線驗證</div>' +
        '<div class="fctl"><button type="button" class="mini acc" id="emb-test">測試連線</button>' +
        '<span class="tstate" id="emb-state"></span></div></div>' +
        '<div class="frow"><div class="flabel">操作</div>' +
        '<div class="fctl"><button type="button" class="mini acc" id="emb-save">儲存</button>' +
        '<button type="button" class="mini" id="emb-reembed">重新索引全部</button>' +
        '<span class="tstate" id="emb-op"></span></div></div>' +
        '<div class="gnote" id="emb-status">載入 Embedding 設定…</div>' +
        '<div class="gnote">換 embedding 模型後向量維度可能改變，需按「重新索引全部」重編碼（較慢）。</div>';

      const seg = el.querySelector('#emb-seg') as HTMLElement;
      const modelIn = el.querySelector('#emb-model') as HTMLInputElement;
      const urlIn = el.querySelector('#emb-url') as HTMLInputElement;
      const keyIn = el.querySelector('#emb-key') as HTMLInputElement;
      const stateEl = el.querySelector('#emb-state') as HTMLElement;
      const opEl = el.querySelector('#emb-op') as HTMLElement;
      const statusEl = el.querySelector('#emb-status') as HTMLElement;
      let backend: 'api' | 'local' = 'api';

      const renderSeg = () => {
        seg.querySelectorAll('button').forEach((b) =>
          b.classList.toggle('on', b.getAttribute('data-eb') === backend));
        el.querySelectorAll<HTMLElement>('.emb-api').forEach((r) => {
          r.style.display = backend === 'api' ? '' : 'none';
        });
      };

      getBackendSettings().then((s) => {
        backend = s.embed.backend === 'local' ? 'local' : 'api';
        modelIn.value = s.embed.model || '';
        urlIn.value = s.embed.base_url || '';
        keyIn.placeholder = s.embed.api_key_tail ? `已儲存（${s.embed.api_key_tail}）— 輸入以更換` : 'sk-...';
        renderSeg();
        statusEl.textContent = `目前：${backend === 'api' ? '雲端' : '地端'} · ${s.embed.model || '(未設定)'}`;
      }).catch(() => { statusEl.textContent = '後端未連線'; renderSeg(); });

      seg.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('[data-eb]');
        if (!b) return;
        backend = b.getAttribute('data-eb') === 'local' ? 'local' : 'api';
        renderSeg();
      });

      el.querySelector('#emb-test')!.addEventListener('click', async () => {
        if (backend === 'local') {
          stateEl.className = 'tstate';
          stateEl.textContent = '地端模型於後端載入，儲存後生效（此處不測試）';
          return;
        }
        stateEl.className = 'tstate run';
        stateEl.textContent = '驗證中…';
        try {
          const r = await testEmbedding(urlIn.value.trim(), keyIn.value.trim(), modelIn.value.trim());
          stateEl.className = r.ok ? 'tstate ok' : 'tstate err';
          stateEl.textContent = (r.ok ? '✓ ' : '✗ ') + r.message;
        } catch {
          stateEl.className = 'tstate err';
          stateEl.textContent = '✗ 連線失敗（確認後端 :8100）';
        }
      });

      el.querySelector('#emb-save')!.addEventListener('click', async () => {
        try {
          await pushEmbedConfig(backend, modelIn.value.trim(), urlIn.value.trim(), keyIn.value.trim());
          statusEl.textContent = `目前：${backend === 'api' ? '雲端' : '地端'} · ${modelIn.value.trim()}`;
          ctx.toast({ title: 'Embedding 已儲存', message: '若換了模型，記得按「重新索引全部」', duration: 3800 });
        } catch {
          ctx.toast({ title: '儲存失敗', message: '確認後端 :8100', duration: 3000 });
        }
      });

      const reBtn = el.querySelector('#emb-reembed') as HTMLButtonElement;
      reBtn.addEventListener('click', async () => {
        if (reBtn.disabled) return;
        if (!confirm('重新索引會用目前 embedding 設定重編碼「全部」chunk，較慢。確定執行？')) return;
        reBtn.disabled = true;
        opEl.className = 'tstate run';
        opEl.textContent = '重新索引中…（可能數十秒）';
        try {
          const r = await reembedAll();
          opEl.className = 'tstate ok';
          opEl.textContent = `✓ 已重編 ${r.reembedded} 段 · 維度 ${r.dim}`;
          ctx.toast({ title: '重新索引完成', message: `${r.reembedded} 段 · 維度 ${r.dim}`, duration: 3800 });
        } catch {
          opEl.className = 'tstate err';
          opEl.textContent = '✗ 失敗（確認後端）';
        } finally {
          reBtn.disabled = false;
        }
      });
    },
  };
}

/* ---------- 新聞自動更新 group（每日排程，接後端 /api/schedule） ---------- */
function scheduleGroup(): SettingGroup {
  return {
    title: '新聞自動更新',
    badge: '每日排程',
    badgeTone: 'live',
    saveMode: 'instant',
    custom(el, ctx: SettingsCtx) {
      el.innerHTML =
        '<div class="frow"><div class="flabel">自動更新<span class="help">每天定時抓新聞並重生成晨報</span></div>' +
        '<div class="fctl"><div class="seg" id="sch-seg">' +
        '<button type="button" data-en="on">啟用</button><button type="button" data-en="off">停用</button>' +
        '</div><span class="flash" data-flash="sch">✓ 已生效</span></div></div>' +
        '<div class="frow"><div class="flabel">每日時間<span class="help">伺服器本地時間</span></div>' +
        '<div class="fctl"><input class="tin" id="sch-time" type="time" value="06:30" style="width:130px"></div></div>' +
        '<div class="frow"><div class="flabel">立即更新</div>' +
        '<div class="fctl"><button type="button" class="mini acc" id="sch-now">立即更新一次</button>' +
        '<span class="tstate" id="sch-now-state"></span></div></div>' +
        '<div class="gnote" id="sch-status">載入排程狀態…</div>';

      const seg = el.querySelector('#sch-seg') as HTMLElement;
      const timeIn = el.querySelector('#sch-time') as HTMLInputElement;
      const statusEl = el.querySelector('#sch-status') as HTMLElement;
      let enabled = false;

      const renderSeg = () => seg.querySelectorAll('button').forEach((b) =>
        b.classList.toggle('on', b.getAttribute('data-en') === (enabled ? 'on' : 'off')));
      const flash = () => {
        const fl = el.querySelector('[data-flash="sch"]');
        if (fl) { fl.classList.add('show'); setTimeout(() => fl.classList.remove('show'), 1400); }
      };
      const fmt = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '');
      const paint = (s: { enabled: boolean; last_run_at: string | null; next_run: string | null }) => {
        const last = s.last_run_at ? `上次執行 ${fmt(s.last_run_at)}` : '尚未執行過';
        const next = s.enabled && s.next_run ? `　·　下次 ${fmt(s.next_run)}` : '';
        statusEl.textContent = last + next;
      };
      const push = async () => {
        try {
          paint(await setSchedule(enabled, timeIn.value || '06:30'));
          flash();
        } catch {
          statusEl.textContent = '後端未連線，設定未儲存';
        }
      };

      getSchedule().then((s) => {
        enabled = s.enabled; timeIn.value = s.time || '06:30'; renderSeg(); paint(s);
      }).catch(() => { statusEl.textContent = '後端未連線'; renderSeg(); });

      seg.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('[data-en]') as HTMLButtonElement | null;
        if (!b) return;
        enabled = b.getAttribute('data-en') === 'on';
        renderSeg();
        void push();
      });
      timeIn.addEventListener('change', () => void push());

      const nowBtn = el.querySelector('#sch-now') as HTMLButtonElement;
      const nowState = el.querySelector('#sch-now-state') as HTMLElement;
      nowBtn.addEventListener('click', async () => {
        if (nowBtn.disabled) return;
        nowBtn.disabled = true;
        nowState.className = 'tstate run';
        nowState.textContent = '更新中…';
        try {
          await runNewsRefresh();
          nowState.className = 'tstate ok';
          nowState.textContent = '✓ 已更新';
          paint(await getSchedule());
          ctx.toast({ title: '新聞已更新', message: '晨報已重新生成', duration: 3000 });
        } catch {
          nowState.className = 'tstate err';
          nowState.textContent = '✗ 失敗（確認後端 :8100）';
        } finally {
          nowBtn.disabled = false;
          setTimeout(() => { nowState.textContent = ''; }, 4000);
        }
      });
    },
  };
}

export const policySection: SettingsSection = {
  id: 'policy',
  label: '政策報告',
  color: '#38BDF8',
  status: () => getProviders().filter((p) => p.connected).length + ' 供應商已連線',
  groups: [llmGroup(), modelGroup(), embeddingGroup(), scheduleGroup(), kbGroup()],
};

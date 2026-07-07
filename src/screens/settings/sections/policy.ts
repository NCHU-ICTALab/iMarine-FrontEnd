import { getSetting, setSetting } from '../storage';
import { tail4 } from '../renderer';
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
function setKbs(list: Kb[]): void {
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

/* ---------- 生成接口 group（instant segmented） ---------- */
function llmGroup(): SettingGroup {
  return {
    title: '生成接口',
    badge: '即時生效 · 與政策頁同步',
    badgeTone: 'live',
    saveMode: 'instant',
    custom(el) {
      const cur = getSetting<'local' | 'cloud'>('policy.llmMode', 'local');
      el.innerHTML =
        '<div class="frow"><div class="flabel">LLM 接口<span class="help">政策頁標題列的切換器與此雙向同步</span></div>' +
        '<div class="fctl"><div class="seg" id="pol-llmseg">' +
        '<button type="button" data-llm="local" class="' + (cur === 'local' ? 'on' : '') + '">地端部署</button>' +
        '<button type="button" data-llm="cloud" class="' + (cur === 'cloud' ? 'on' : '') + '">雲端 API</button>' +
        '</div><span class="flash" data-flash="llm">✓ 已生效</span></div></div>';
      const seg = el.querySelector('#pol-llmseg') as HTMLElement;
      seg.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('[data-llm]') as HTMLButtonElement | null;
        if (!b) return;
        const v = b.getAttribute('data-llm') as 'local' | 'cloud';
        setSetting('policy.llmMode', v);
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        const fl = el.querySelector('[data-flash="llm"]');
        if (fl) {
          fl.classList.add('show');
          setTimeout(() => fl.classList.remove('show'), 1400);
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

      testBtn.addEventListener('click', () => {
        if (!pmProv) return;
        const prov = pmProv;
        const url = urlIn.value.trim();
        const key = keyIn.value.trim();
        stateEl.className = 'tstate run';
        stateEl.innerHTML = '<span class="spin"></span>驗證中…';
        setTimeout(() => {
          if (!/^https?:\/\/.+/.test(url)) {
            stateEl.className = 'tstate err';
            stateEl.textContent = '✗ API URL 格式不正確';
            return;
          }
          if (!key && !prov.keyOptional && !(prov.connected && prov.key)) {
            stateEl.className = 'tstate err';
            stateEl.textContent = '✗ 需要 API KEY';
            return;
          }
          pmTestedModels = prov.models.length
            ? prov.models
            : (prov.catalog ?? []).map((m) => ({ ...m, enabled: m.kind === 'chat' }));
          stateEl.className = 'tstate ok';
          stateEl.textContent = '✓ 驗證通過 · 已載入 ' + pmTestedModels.length + ' 個模型';
          modelsEl.innerHTML = modelListHtml(pmTestedModels);
          saveBtn.disabled = false;
          hintEl.textContent = '';
        }, 1200);
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
function docsListHtml(kb: Kb): string {
  if (!kb.docs.length) return '<div class="gnote">尚無文件 — 由下方上傳。</div>';
  return kb.docs.map((d) =>
    '<div class="docrow"><span class="fn">' + esc(d.name) + '</span>' +
    '<span class="stat ' + (d.status === 'available' ? 'ok' : 'idx') + '">' +
    (d.status === 'available' ? 'available' : 'indexing…') + '</span>' +
    '<button type="button" class="rm" data-rmdoc="' + esc(d.id) + '" title="刪除">×</button></div>',
  ).join('');
}

function stratCardsHtml(r: Kb['retrieval']): string {
  return (
    [
      ['vector', '向量檢索', '語意相似度'],
      ['fulltext', '全文檢索', '關鍵字倒排索引'],
      ['hybrid', 'Hybrid', '語意 + 關鍵字加權'],
    ] as const
  ).map((s) => '<div class="scard' + (r.strategy === s[0] ? ' on' : '') + '" data-strat="' + s[0] + '"><b>' + s[1] + '</b>' + s[2] + '</div>').join('');
}

function kbModalHtml(): string {
  return (
    '<div class="mwrap" id="kbmodal"><div class="mbox wide">' +
    '<div class="mhead"><h3 id="kb-title">知識庫</h3><span class="sp"></span>' +
    '<button type="button" class="mclose" id="kb-close">×</button></div>' +
    '<div class="msec">文件（即時生效）</div><div id="kb-docs"></div>' +
    '<div class="drop" id="kb-drop">拖放或點擊上傳文件（PDF / DOCX / TXT）</div>' +
    '<input type="file" id="kb-file" multiple style="display:none">' +
    '<div class="msec">分段與索引（需儲存）</div>' +
    '<div class="frow"><div class="flabel">Chunk 長度<span class="help">tokens</span></div>' +
    '<div class="fctl"><input class="tin num" id="kb-chunk" type="number" min="64" max="4096" step="64"></div></div>' +
    '<div class="frow"><div class="flabel">Chunk 重疊<span class="help">tokens</span></div>' +
    '<div class="fctl"><input class="tin num" id="kb-overlap" type="number" min="0" max="1024" step="16"></div></div>' +
    '<div class="frow"><div class="flabel">Embedding 模型</div>' +
    '<div class="fctl"><select class="sel" id="kb-emb"></select></div></div>' +
    '<div class="msec">檢索策略（需儲存）</div><div class="strat" id="kb-strat"></div>' +
    '<div class="subopt" id="kb-hybrid" style="display:none">' +
    '<div class="rlab"><span>語意權重</span><span id="kb-wlab">0.6</span><span>關鍵字權重</span></div>' +
    '<input type="range" class="rng" id="kb-weight" min="0" max="100" value="60"></div>' +
    '<div class="frow" style="margin-top:8px"><div class="flabel">Rerank 重排序</div><div class="fctl">' +
    '<label class="tgl" id="kb-rrwrap"><input type="checkbox" id="kb-rerank"><span class="tr"></span><span class="th"></span></label>' +
    '<select class="sel" id="kb-rrmodel" style="display:none"></select>' +
    '<span class="guide" id="kb-rrguide" style="display:none">尚無可用 rerank 模型 — <a id="kb-goprov">先至模型管理設定</a></span>' +
    '</div></div>' +
    '<div class="savebar" id="kb-savebar"><span>未儲存變更</span><span class="sp"></span>' +
    '<button type="button" class="mini" id="kb-discard">捨棄</button>' +
    '<button type="button" class="mini acc" id="kb-save">儲存</button></div>' +
    '<div class="saved" id="kb-saved">✓ 已儲存</div>' +
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
    '<div class="frow"><div class="flabel">描述（選填）</div>' +
    '<div class="fctl"><input class="tin" id="nk-desc" placeholder="這個知識庫收錄什麼"></div></div>' +
    '<div class="savebar show" style="background:transparent;border-color:rgba(255,255,255,.1);color:var(--ink60)">' +
    '<span></span><span class="sp"></span><button type="button" class="mini acc" id="nk-create">建立</button></div>' +
    '</div></div>'
  );
}

function kbGroup(): SettingGroup {
  return {
    title: '知識庫管理',
    saveMode: 'instant',
    custom(el, ctx: SettingsCtx) {
      let kbs = getKbs();
      let kbCur: Kb | null = null;
      let kbDraft: { chunk: Kb['chunk']; retrieval: Kb['retrieval'] } | null = null;
      // 兩個 modal（知識庫 / 新增知識庫）各自獨立的 Escape 生命週期，沿用 modelGroup 的
      // escOff 模式：卡片無 tabindex，開 modal 後 focus 停在 body，keydown 只會冒泡到
      // document，故監聽必須掛在 document、且開一次掛一次、關一次卸一次，避免疊加殘留。
      let escOffKb: (() => void) | null = null;
      let escOffNk: (() => void) | null = null;

      // 動態「n 庫 · m 文件」badge + 「重置為預設」鈕：schema 的 g.badge 是靜態字串，無法反映
      // 即時庫/文件數，故不設 g.badge，改在 custom 執行當下手動插入 ghead（同 modelGroup 手法）。
      const card = el.parentElement;
      const ghead = card?.querySelector('.ghead');
      if (ghead && !ghead.querySelector('.gbadge')) {
        const badge = document.createElement('span');
        badge.className = 'gbadge blue';
        badge.textContent = kbs.length + ' 庫 · ' + kbs.reduce((a, k) => a + k.docs.length, 0) + ' 文件';
        ghead.insertBefore(badge, ghead.querySelector('.sp'));
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'mini';
        resetBtn.id = 'kb-reset';
        resetBtn.textContent = '重置為預設';
        ghead.appendChild(resetBtn);
        resetBtn.addEventListener('click', () => {
          if (!confirm('重置知識庫為預設五庫？（自訂庫與變更將移除）')) return;
          setKbs(JSON.parse(JSON.stringify(KB_PRESET)));
          ctx.rerender();
        });
      }

      el.innerHTML =
        '<div class="kbgrid">' +
        kbs.map((k) =>
          '<div class="kbcard" data-kb="' + esc(k.id) + '">' +
          '<b>' + esc(k.name) + '</b>' +
          '<span class="meta">' + k.docs.length + ' 文件 · ' + k.retrieval.strategy +
          (k.retrieval.rerank ? ' · rerank' : '') + '</span>' +
          '<span class="del" data-delkb="' + esc(k.id) + '" title="刪除知識庫">×</span></div>',
        ).join('') +
        '<div class="kbcard addc" id="kb-add">+ 新增知識庫</div></div>' +
        '<div class="gnote">點知識庫卡片管理文件與分段/檢索參數。刪除與上傳為即時生效；參數需儲存。</div>' +
        kbModalHtml() + nkModalHtml();

      // ---- 卡牆外層局部刷新（doc 級操作 modal 開著時不能整組 rerender，否則會把 modal 拆掉）----
      function refreshBadge(): void {
        const b = ghead?.querySelector('.gbadge');
        if (b) b.textContent = kbs.length + ' 庫 · ' + kbs.reduce((a, k) => a + k.docs.length, 0) + ' 文件';
      }
      function refreshCard(kb: Kb): void {
        const c = el.querySelector('.kbcard[data-kb="' + kb.id + '"]');
        const m = c?.querySelector('.meta');
        if (m) m.textContent = kb.docs.length + ' 文件 · ' + kb.retrieval.strategy + (kb.retrieval.rerank ? ' · rerank' : '');
      }

      el.querySelectorAll<HTMLElement>('[data-kb]').forEach((c) => {
        c.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('[data-delkb]')) return;
          openKb(c.getAttribute('data-kb') as string);
        });
      });
      el.querySelectorAll<HTMLElement>('[data-delkb]').forEach((d) => {
        d.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = d.getAttribute('data-delkb');
          const kb = kbs.find((k) => k.id === id);
          if (!kb) return;
          if (!confirm('刪除知識庫「' + kb.name + '」？（' + kb.docs.length + ' 份文件將一併移除）')) return;
          kbs = kbs.filter((k) => k.id !== kb.id);
          setKbs(kbs);
          ctx.rerender();
        });
      });

      const nkWrap = el.querySelector('#nkmodal') as HTMLElement;
      const nkNameIn = nkWrap.querySelector('#nk-name') as HTMLInputElement;
      const nkDescIn = nkWrap.querySelector('#nk-desc') as HTMLInputElement;

      function closeNkModal(): void {
        nkWrap.classList.remove('open');
        if (escOffNk) { escOffNk(); escOffNk = null; }
      }
      function openNk(): void {
        nkNameIn.value = '';
        nkDescIn.value = '';
        nkWrap.classList.add('open');
        if (escOffNk) { escOffNk(); escOffNk = null; }
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNkModal(); };
        document.addEventListener('keydown', onEsc);
        escOffNk = () => document.removeEventListener('keydown', onEsc);
      }
      (el.querySelector('#kb-add') as HTMLElement).addEventListener('click', openNk);
      (nkWrap.querySelector('#nk-close') as HTMLElement).addEventListener('click', closeNkModal);
      nkWrap.addEventListener('click', (e) => { if (e.target === nkWrap) closeNkModal(); });
      (nkWrap.querySelector('#nk-create') as HTMLElement).addEventListener('click', () => {
        const name = nkNameIn.value.trim();
        if (!name) { nkNameIn.focus(); return; }
        const kb: Kb = {
          id: 'kb' + (Date.now() % 100000),
          name,
          desc: nkDescIn.value.trim(),
          docs: [],
          chunk: { size: 512, overlap: 64 },
          retrieval: {
            strategy: 'vector', hybridWeight: 60, rerank: false, rerankModel: '',
            embeddingModel: connectedModels('embedding')[0] || '',
          },
        };
        kbs.push(kb);
        setKbs(kbs);
        closeNkModal();
        ctx.rerender();
      });

      // ---- 知識庫 modal ----
      const kbWrap = el.querySelector('#kbmodal') as HTMLElement;
      const kbTitle = kbWrap.querySelector('#kb-title') as HTMLElement;
      const kbDocsEl = kbWrap.querySelector('#kb-docs') as HTMLElement;
      const kbDropEl = kbWrap.querySelector('#kb-drop') as HTMLElement;
      const kbFileEl = kbWrap.querySelector('#kb-file') as HTMLInputElement;
      const kbChunkIn = kbWrap.querySelector('#kb-chunk') as HTMLInputElement;
      const kbOverlapIn = kbWrap.querySelector('#kb-overlap') as HTMLInputElement;
      const kbEmbSel = kbWrap.querySelector('#kb-emb') as HTMLSelectElement;
      const kbStratEl = kbWrap.querySelector('#kb-strat') as HTMLElement;
      const kbHybridEl = kbWrap.querySelector('#kb-hybrid') as HTMLElement;
      const kbWeightIn = kbWrap.querySelector('#kb-weight') as HTMLInputElement;
      const kbWlabEl = kbWrap.querySelector('#kb-wlab') as HTMLElement;
      const kbRerankCk = kbWrap.querySelector('#kb-rerank') as HTMLInputElement;
      const kbRrModelSel = kbWrap.querySelector('#kb-rrmodel') as HTMLSelectElement;
      const kbRrGuideEl = kbWrap.querySelector('#kb-rrguide') as HTMLElement;
      const kbGoProvA = kbWrap.querySelector('#kb-goprov') as HTMLElement;
      const kbSavebarEl = kbWrap.querySelector('#kb-savebar') as HTMLElement;
      const kbSavedEl = kbWrap.querySelector('#kb-saved') as HTMLElement;
      const kbSaveBtn = kbWrap.querySelector('#kb-save') as HTMLButtonElement;
      const kbDiscardBtn = kbWrap.querySelector('#kb-discard') as HTMLButtonElement;

      function renderKbDocs(): void {
        if (!kbCur) return;
        kbDocsEl.innerHTML = docsListHtml(kbCur);
      }
      function renderKbParams(): void {
        if (!kbCur || !kbDraft) return;
        const r = kbDraft.retrieval;
        kbChunkIn.value = String(kbDraft.chunk.size);
        kbOverlapIn.value = String(kbDraft.chunk.overlap);
        const emb = connectedModels('embedding');
        kbEmbSel.innerHTML = emb.length
          ? emb.map((m) => '<option value="' + esc(m) + '"' + (m === r.embeddingModel ? ' selected' : '') + '>' + esc(m) + '</option>').join('')
          : '<option value="">（無可用 embedding 模型）</option>';
        kbEmbSel.disabled = !emb.length;
        kbStratEl.innerHTML = stratCardsHtml(r);
        kbHybridEl.style.display = r.strategy === 'hybrid' ? '' : 'none';
        kbWeightIn.value = String(r.hybridWeight);
        kbWlabEl.textContent = (r.hybridWeight / 100).toFixed(1);
        kbRerankCk.checked = r.rerank;
        const rr = connectedModels('rerank');
        if (r.rerank) {
          if (rr.length) {
            kbRrModelSel.style.display = '';
            kbRrGuideEl.style.display = 'none';
            kbRrModelSel.innerHTML = rr.map((m) => '<option value="' + esc(m) + '"' + (m === r.rerankModel ? ' selected' : '') + '>' + esc(m) + '</option>').join('');
          } else {
            kbRrModelSel.style.display = 'none';
            kbRrGuideEl.style.display = '';
          }
        } else {
          kbRrModelSel.style.display = 'none';
          kbRrGuideEl.style.display = 'none';
        }
      }
      function kbDirty(): void {
        kbSavebarEl.classList.add('show');
        kbSavedEl.classList.remove('show');
      }
      function closeKbModal(): void {
        kbWrap.classList.remove('open');
        if (escOffKb) { escOffKb(); escOffKb = null; }
      }
      function openKb(id: string): void {
        const kb = kbs.find((k) => k.id === id);
        if (!kb) return;
        kbCur = kb;
        kbDraft = JSON.parse(JSON.stringify({ chunk: kb.chunk, retrieval: kb.retrieval }));
        kbTitle.textContent = '知識庫 — ' + kb.name;
        renderKbDocs();
        renderKbParams();
        kbSavebarEl.classList.remove('show');
        kbSavedEl.classList.remove('show');
        kbWrap.classList.add('open');
        if (escOffKb) { escOffKb(); escOffKb = null; }
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeKbModal(); };
        document.addEventListener('keydown', onEsc);
        escOffKb = () => document.removeEventListener('keydown', onEsc);
      }

      (kbWrap.querySelector('#kb-close') as HTMLElement).addEventListener('click', closeKbModal);
      kbWrap.addEventListener('click', (e) => { if (e.target === kbWrap) closeKbModal(); });

      kbChunkIn.addEventListener('input', () => {
        if (!kbDraft) return;
        kbDraft.chunk.size = Number(kbChunkIn.value) || 512;
        kbDirty();
      });
      kbOverlapIn.addEventListener('input', () => {
        if (!kbDraft) return;
        kbDraft.chunk.overlap = Number(kbOverlapIn.value) || 0;
        kbDirty();
      });
      kbEmbSel.addEventListener('change', () => {
        if (!kbDraft) return;
        kbDraft.retrieval.embeddingModel = kbEmbSel.value;
        kbDirty();
      });
      kbStratEl.addEventListener('click', (e) => {
        const s = (e.target as HTMLElement).closest('[data-strat]') as HTMLElement | null;
        if (!s || !kbDraft) return;
        kbDraft.retrieval.strategy = s.getAttribute('data-strat') as Kb['retrieval']['strategy'];
        renderKbParams();
        kbDirty();
      });
      kbWeightIn.addEventListener('input', () => {
        if (!kbDraft) return;
        kbDraft.retrieval.hybridWeight = Number(kbWeightIn.value);
        kbWlabEl.textContent = (kbDraft.retrieval.hybridWeight / 100).toFixed(1);
        kbDirty();
      });
      kbRerankCk.addEventListener('change', () => {
        if (!kbDraft) return;
        kbDraft.retrieval.rerank = kbRerankCk.checked;
        renderKbParams();
        kbDirty();
      });
      kbRrModelSel.addEventListener('change', () => {
        if (!kbDraft) return;
        kbDraft.retrieval.rerankModel = kbRrModelSel.value;
        kbDirty();
      });
      kbGoProvA.addEventListener('click', () => {
        closeKbModal();
        ctx.goto('policy', '模型管理');
      });
      kbSaveBtn.addEventListener('click', () => {
        if (!kbCur || !kbDraft) return;
        kbCur.chunk = kbDraft.chunk;
        kbCur.retrieval = kbDraft.retrieval;
        setKbs(kbs);
        kbDraft = JSON.parse(JSON.stringify({ chunk: kbCur.chunk, retrieval: kbCur.retrieval }));
        kbSavebarEl.classList.remove('show');
        kbSavedEl.classList.remove('show');
        void kbSavedEl.offsetWidth;
        kbSavedEl.classList.add('show');
        refreshCard(kbCur);
      });
      kbDiscardBtn.addEventListener('click', () => {
        if (!kbCur) return;
        kbDraft = JSON.parse(JSON.stringify({ chunk: kbCur.chunk, retrieval: kbCur.retrieval }));
        renderKbParams();
        kbSavebarEl.classList.remove('show');
      });
      kbDocsEl.addEventListener('click', (e) => {
        const rm = (e.target as HTMLElement).closest('[data-rmdoc]') as HTMLElement | null;
        if (!rm || !kbCur) return;
        const docId = rm.getAttribute('data-rmdoc');
        const doc = kbCur.docs.find((x) => x.id === docId);
        if (!doc) return;
        if (!confirm('刪除文件「' + doc.name + '」？')) return;
        kbCur.docs = kbCur.docs.filter((x) => x.id !== doc.id);
        setKbs(kbs);
        renderKbDocs();
        refreshCard(kbCur);
        refreshBadge();
      });
      kbDropEl.addEventListener('click', () => kbFileEl.click());
      kbFileEl.addEventListener('change', () => {
        if (!kbCur) return;
        const kb = kbCur;
        const files = Array.from(kbFileEl.files ?? []);
        if (!files.length) return;
        files.forEach((f) => {
          const doc: Kb['docs'][number] = {
            id: 'u' + Date.now() + Math.floor(Math.random() * 1e4),
            name: f.name,
            status: 'indexing',
          };
          kb.docs.push(doc);
          // 3 秒後轉 available：對「當下最新的 storage 快照」做針對性 patch 再寫回，
          // 避免這個非同步 callback（可能在使用者已離開/切換分區後才觸發）用本次
          // render 捕捉到的舊 kbs 陣列整批覆寫，蓋掉期間發生的其他變更。
          setTimeout(() => {
            const latest = getKbs();
            const li = latest.findIndex((k) => k.id === kb.id);
            if (li >= 0) {
              const di = latest[li].docs.findIndex((x) => x.id === doc.id);
              if (di >= 0) latest[li].docs[di].status = 'available';
              setKbs(latest);
            }
            doc.status = 'available';
            if (kbCur === kb && kbWrap.classList.contains('open')) renderKbDocs();
            refreshCard(kb);
            refreshBadge();
          }, 3000);
        });
        kbFileEl.value = '';
        setKbs(kbs);
        renderKbDocs();
        refreshCard(kb);
        refreshBadge();
      });
    },
  };
}

export const policySection: SettingsSection = {
  id: 'policy',
  label: '政策報告',
  color: '#38BDF8',
  status: () => getProviders().filter((p) => p.connected).length + ' 供應商已連線',
  groups: [llmGroup(), modelGroup(), kbGroup()],
};

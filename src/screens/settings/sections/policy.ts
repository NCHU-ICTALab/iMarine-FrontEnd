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

export function getProviders(): ProviderCfg[] {
  return getSetting<ProviderCfg[]>('policy.providers', PROVIDER_PRESET);
}
function setProviders(list: ProviderCfg[]): void {
  setSetting('policy.providers', list);
}
function getDefaults(): PolicyDefaults {
  return getSetting<PolicyDefaults>('policy.defaults', DEFAULTS_PRESET);
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
          '<span class="meta">' + (p.connected ? (p.keyOptional && !p.key ? '免金鑰（地端）' : tail4(p.key)) : '未設定') + '</span>' +
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
      }

      // Setup modal 靜態元件（測試連線/儲存/移除/眼睛/勾選/關閉）只綁一次：
      // custom() 本身每次分區重渲染才會重跑一次（不會在單次開合 modal 期間重複呼叫），
      // 故此處綁定不會造成重複監聽。
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

      const closeModal = () => wrap.classList.remove('open');
      (wrap.querySelector('#pm-close') as HTMLElement).addEventListener('click', closeModal);
      wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
      el.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') closeModal(); });

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

export const policySection: SettingsSection = {
  id: 'policy',
  label: '政策報告',
  color: '#38BDF8',
  status: () => getProviders().filter((p) => p.connected).length + ' 供應商已連線',
  groups: [llmGroup(), modelGroup()],
};

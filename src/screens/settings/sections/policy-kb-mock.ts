/* settings「政策報告」知識庫分區的 mock fallback 與本機檢索參數。
   - mountMockKb：後端（rag-agent）不在時，整組還原原版 mock 知識庫體驗（Task 2 加入）。
   - strategyBlockHtml/bindStrategyBlock：檢索策略區塊，live modal 共用（Task 4 加入）。
   - kbParams：live 知識庫（source_id）的本機檢索參數，存而不用——後端無對應 API，
     之後支援時只改讀取點。mock 庫的參數仍存 Kb 物件（key 'policy.kbs'），互不相干。 */
import { getSetting, setSetting } from '../storage';
import {
  KB_PRESET, connectedModels, getKbs, setKbs,
} from './policy';
import type { Kb } from './policy';
import type { SettingsCtx } from '../schema';

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

/* ---------- mock 知識庫全套（後端不在時的 fallback；還原自 main 版 kbGroup.custom） ----------
   循環 import 說明：本檔 import './policy' 的資料層符號、policy.ts import 本檔的 mountMockKb，
   兩邊都只在函式執行期取用（無模組初始化期的值存取），ESM 循環安全；vitest/tsc/build 可驗。 */

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

function mockKbModalHtml(): string {
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

function mockNkModalHtml(): string {
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

/* 後端不在時的整組接管：重寫 el.innerHTML（原版卡牆＋原版兩 modal），PR 渲染的 live DOM
   一併被替換——catch 發生在任何 live 互動之前，無狀態殘留。行為與 main 版逐字一致，
   僅 ghead 加 MOCK chip（低調標示，沿用 .gbadge.wait 琥珀變體）。 */
export function mountMockKb(el: HTMLElement, ctx: SettingsCtx): void {
  let kbs = getKbs();
  let kbCur: Kb | null = null;
  let kbDraft: { chunk: Kb['chunk']; retrieval: Kb['retrieval'] } | null = null;
  // 兩個 modal（知識庫 / 新增知識庫）各自獨立的 Escape 生命週期，沿用 modelGroup 的
  // escOff 模式：卡片無 tabindex，開 modal 後 focus 停在 body，keydown 只會冒泡到
  // document，故監聽必須掛在 document、且開一次掛一次、關一次卸一次，避免疊加殘留。
  let escOffKb: (() => void) | null = null;
  let escOffNk: (() => void) | null = null;

  const card = el.parentElement;
  const ghead = card?.querySelector('.ghead');
  if (ghead && !ghead.querySelector('.gbadge')) {
    const mock = document.createElement('span');
    mock.className = 'gbadge wait';
    mock.textContent = 'MOCK';
    mock.title = '後端未連線，目前為示範資料';
    ghead.insertBefore(mock, ghead.querySelector('.sp'));
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
    mockKbModalHtml() + mockNkModalHtml();

  // ---- 卡牆外層局部刷新（doc 級操作 modal 開著時不能整組 rerender，否則會把 modal 拆掉）----
  function refreshBadge(): void {
    const b = ghead?.querySelectorAll('.gbadge')[1];
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
}

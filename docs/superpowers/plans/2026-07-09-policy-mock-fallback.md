# Policy/Settings mock fallback 整合 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在協作者 PR #1（`feat/policy-rag-integration`）的 live 功能一字不動的前提下，把 settings「政策報告」分區失去的 mock 示範能力整合回來（知識庫 mock fallback 全套、測試連線假驗證 fallback、檢索策略/rerank/hybrid 畫面 live/mock 皆有）。

**Architecture:** 方案 B——還原碼放新檔 `policy-kb-mock.ts`（自 `main:src/screens/settings/sections/policy.ts` 還原＋薄適配），對 PR 檔案 `sections/policy.ts` 僅四個插入點級改動。模式判定沿用 PR 的 per-call try/catch，首次 `listSources()` 失敗即掛載 mock。

**Tech Stack:** Vite + vanilla TS、Liquid Glass Kit、vitest、headless Chrome + CDP（SwiftShader）。

**Spec:** `docs/superpowers/specs/2026-07-09-policy-mock-fallback-design.md`（先讀）。

## Global Constraints

- **PR live 邏輯零改動**：`src/screens/settings/sections/policy.ts` 只允許本計畫列出的四個插入點；`src/data/exchange/policy.ts`、`src/screens/settings/backend.ts`、`src/screens/policy/*`、`src/data/types.ts`、`src/main.ts` 零 diff（Task 5 以 `git diff origin/feat/policy-rag-integration...HEAD` 驗證）。
- **commit 一律由使用者下**（專案規約）；每 task 結尾為檢查點，停下請使用者 commit，建議訊息附在該步。不加任何 Claude/Anthropic 署名。
- 禁止 emoji；禁止順手清理/typo 修正/import 整理。
- 元件用 Liquid Glass Kit；不手寫 `backdrop-filter`。
- CSS 變數注意兩套慣例：settings scope 用 `--ink40/--ink60`（settings.css:16 自定義）、全域 tokens 用 `--ink-40/--ink-60`。
- headless 驗證：獨立 Chrome + SwiftShader flags（`--use-gl=angle --use-angle=swiftshader --run-all-compositor-stages-before-draw`），**勿加 `--disable-gpu`**，跑畢 pkill 清進程。
- 分支：`policy-mock-fallback`，base `origin/feat/policy-rag-integration`（head `9033aba`）。
- **zsh 陷阱（驗證指令必讀）**：`git show $REF:src/...` 在 zsh 會把 `:s` 解析成參數修飾符，輸出變成 commit diff 而非檔案內容（行號帶 +/- 前綴即中招）。一律寫 `git show "${REF}:src/..."`（大括號 + 引號）。

## 背景速讀（給零脈絡工程師）

- 這是競賽 demo 的前端 shell（Vite + vanilla TS，無 React）。settings 頁是 schema 驅動：每分區（`sections/*.ts`）回傳 `SettingsSection`，其 `groups` 內的 `SettingGroup.custom?(el, ctx)` 由 `renderer.ts` 以 `g.custom(body, ctx)` 呼叫（`ctx: SettingsCtx` 有 `rerender()`/`goto(sectionId, groupTitle)`/`toast()`）。
- 設定存 localStorage 單一 key（`storage.ts` 的 `getSetting/setSetting`）。
- PR #1 把 `sections/policy.ts` 的知識庫 group 改成打真後端（`backend.ts` 的 `listSources()` 等），並把 `custom(el, ctx)` 簽名改成 `custom(el)`（ctx 沒用到就拿掉了——renderer 仍然傳 ctx，加回參數即可）。
- mock 資料層 `KB_PRESET`（五庫預置）/`getKbs()`/`setKbs()`（key `policy.kbs`）PR **沒有刪**，`tests/settings-policy-preset.test.ts` 現仍全綠。原 mock UI 程式在 `main:src/screens/settings/sections/policy.ts` 460-847 行，本計畫將其還原到新檔。
- mock modal 所需 CSS（`.strat/.scard/.subopt/.savebar/.rng/.tgl/.kbgrid/.kbcard/.docrow` 等）PR 對 settings.css 零刪除行，**全數健在**；MOCK chip 直接用既有 `.gbadge.wait` 變體（琥珀低調），settings.css 零改動（比 spec §5 預估再少一檔）。

---

### Task 1: 分支建立 + `policy.kbParams` 資料層（TDD）

**Files:**
- Create: `src/screens/settings/sections/policy-kb-mock.ts`（本 task 先建資料層段）
- Test: `tests/settings-kb-params.test.ts`

**Interfaces:**
- Consumes: `getSetting/setSetting`（`../storage`）、`Kb` type（`./policy`，已 export）
- Produces（後續 task 依賴的精確簽名）:
  - `export interface KbParams { chunk: { size: number; overlap: number }; retrieval: Kb['retrieval'] }`
  - `export function defaultKbParams(): KbParams`
  - `export function getKbParams(sourceId: string): KbParams | null`
  - `export function setKbParams(sourceId: string, p: KbParams): void`

- [ ] **Step 1: 建分支（spec 檔為 untracked 會自動跟隨）**

```bash
git checkout -b policy-mock-fallback origin/feat/policy-rag-integration
git log --oneline -1   # 應為 9033aba
```

若使用者尚未 commit spec，先停下請使用者 commit：
`docs(policy-mock): mock fallback 整合 spec`（含 `docs/superpowers/specs/2026-07-09-policy-mock-fallback-design.md`）。

- [ ] **Step 2: 寫失敗測試**

`tests/settings-kb-params.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  defaultKbParams, getKbParams, setKbParams,
} from '../src/screens/settings/sections/policy-kb-mock';

describe('policy.kbParams（live 知識庫本機檢索參數，存而不用）', () => {
  it('無存值回 null；defaultKbParams 形狀正確', () => {
    expect(getKbParams('no_such_source')).toBeNull();
    const d = defaultKbParams();
    expect(d.chunk).toEqual({ size: 512, overlap: 64 });
    expect(d.retrieval.strategy).toBe('vector');
    expect(d.retrieval.hybridWeight).toBe(60);
    expect(d.retrieval.rerank).toBe(false);
  });

  it('round-trip：set 後 get 讀回，且不同 source_id 互不干擾', () => {
    const p = defaultKbParams();
    p.retrieval.strategy = 'hybrid';
    p.retrieval.hybridWeight = 75;
    p.chunk = { size: 1024, overlap: 128 };
    setKbParams('src_a', p);
    expect(getKbParams('src_a')).toEqual(p);
    expect(getKbParams('src_b')).toBeNull();
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

```bash
npx vitest run tests/settings-kb-params.test.ts
```
Expected: FAIL（模組不存在 / 匯出未定義）。

- [ ] **Step 4: 建 `policy-kb-mock.ts`（本 task 只含檔頭與資料層）**

```ts
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
```

注意：`defaultKbParams` 的 `embeddingModel` 先給空字串——`connectedModels('embedding')[0]` 的預填在 Task 4 的 `bindStrategyBlock.load()` 內做（避免資料層依賴 UI 狀態、也讓本測試不需 mock providers）。`esc` 目前尚無使用者，Task 2 會用到（tsconfig 未開 `noUnusedLocals`，不會擋 tsc）。

- [ ] **Step 5: 跑測試確認通過 + tsc**

```bash
npx vitest run tests/settings-kb-params.test.ts   # PASS 2/2
npx tsc --noEmit                                  # 0 errors
```

- [ ] **Step 6: 檢查點——由使用者 commit**

建議訊息：`feat(settings): policy.kbParams 本機檢索參數資料層 TDD`
（含 `src/screens/settings/sections/policy-kb-mock.ts` + `tests/settings-kb-params.test.ts`）

---

### Task 2: mountMockKb 全套還原 + 知識庫分區 fallback 接線

**Files:**
- Modify: `src/screens/settings/sections/policy-kb-mock.ts`（追加 mountMockKb 與還原的私有函式）
- Modify: `src/screens/settings/sections/policy.ts`（插入點 ①②③，見下）

**Interfaces:**
- Consumes: Task 1 的 `esc`；`./policy` 的 `Kb`/`KB_PRESET`/`getKbs`/`setKbs`（本 task 給 setKbs 加 export）/`connectedModels`；`../schema` 的 `SettingsCtx`
- Produces: `export function mountMockKb(el: HTMLElement, ctx: SettingsCtx): void`（Task 5 迴歸依賴其行為）；`stratCardsHtml`（模組私有，Task 4 的 render 重用）

**還原基準**：以下程式碼還原自 `main:src/screens/settings/sections/policy.ts` 460-847 行（可用 `git show main:src/screens/settings/sections/policy.ts | sed -n '460,847p'` 對照），適配僅四處：(a) 包成 `mountMockKb(el, ctx)` 匯出函式（原為 `kbGroup().custom` body）；(b) import 改從 `./policy` 取；(c) ghead badge 段加 MOCK chip；(d) 循環 import 說明註解。**其餘邏輯逐字保留**（含 escOff 生命週期、假 indexing 的 storage 快照 patch 註解）。

- [ ] **Step 1: `policy.ts` 插入點 ①——`setKbs` 加 export（一字級）**

錨點（PR 版現況）：
```ts
function setKbs(list: Kb[]): void {
```
改為：
```ts
export function setKbs(list: Kb[]): void {
```

- [ ] **Step 2: `policy.ts` 插入點 ②——kbGroup custom 簽名還原 ctx**

錨點：
```ts
    custom(el) {
      let sources: BackendSource[] = [];
```
改為（renderer.ts:36 本來就以 `g.custom(body, ctx)` 呼叫，加回參數即可；`SettingsCtx` 已在檔頭 import type）：
```ts
    custom(el, ctx: SettingsCtx) {
      let sources: BackendSource[] = [];
```

- [ ] **Step 3: `policy.ts` 插入點 ③——refresh() 首次失敗改掛 mock**

錨點（PR 版 refresh 全文）：
```ts
      async function refresh(): Promise<void> {
        try {
          sources = await listSources();
        } catch {
          grid.innerHTML =
            '<div class="gnote">後端未連線（VITE_POLICY_API 指定的 rag-agent），無法載入知識庫。</div>';
          return;
        }
        updateBadge();
        renderGrid();
      }
```
改為（僅首次載入退 mock；live 中途死掉維持 PR 原訊息，不做熱切換——spec §2 決策）：
```ts
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
```
同時把 custom 尾端的呼叫錨點：
```ts
      void refresh();
```
改為：
```ts
      void refresh(true);
```
並在檔頭 import 區（`from '../backend';` 那行之後）加：
```ts
import { mountMockKb } from './policy-kb-mock';
```

- [ ] **Step 4: `policy-kb-mock.ts` 追加 mountMockKb（函式本體接在 Task 1 程式碼之後；下方兩個 import 陳述式併入檔頭既有 import 區，勿留在檔案中段）**

```ts
// ↓ 併入檔頭（與 Task 1 的 import 放一起）
import {
  KB_PRESET, connectedModels, getKbs, setKbs,
} from './policy';
import type { SettingsCtx } from '../schema';

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
```

注意兩個相對原版的刻意差異（其餘逐字）：(1) MOCK chip 先插、庫數 badge 後插，`refreshBadge` 因此取 `querySelectorAll('.gbadge')[1]`（第二顆才是庫數）；(2) modal html 函式改名 `mockKbModalHtml/mockNkModalHtml` 避免與 policy.ts 的 live 版同名混淆（id 沿用原版 `kb-*`——mock 模式整組接管 DOM，與 live modal 不共存，無碰撞）。

- [ ] **Step 5: 三綠燈**

```bash
npx tsc --noEmit          # 0 errors
npx vitest run            # 全綠（既有 settings-policy-preset 4 案例必須仍過）
npm run build             # 成功
```

- [ ] **Step 6: CDP 實機驗證（後端不在 → mock 卡牆）**

```bash
npm run dev &   # 記下埠（如 5173）；rag-agent 不要起
mkdir -p /tmp/cdp-prof && (pkill -f 'remote-debugging-port=9460' || true)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --remote-debugging-port=9460 --user-data-dir=/tmp/cdp-prof \
  --use-gl=angle --use-angle=swiftshader --run-all-compositor-stages-before-draw \
  --window-size=1620,1080 about:blank &
```

自寫 CDP 腳本（Node + `ws`，沿用先前 task 手法）逐項斷言：
1. 開 `http://localhost:5173/#settings`（或以鍵盤 `7` 進入）→ 點左欄「政策報告」分區。
2. `#s-settings .kbgrid .kbcard` 數量 = 6（五庫 + 新增卡）；ghead 有兩顆 `.gbadge`，第一顆 textContent=`MOCK`、class 含 `wait`，第二顆為 `5 庫 · N 文件`；`#kb-reset` 存在。
3. 點第一張庫卡 → `#kbmodal.open`；`#kb-strat .scard` = 3；點 `[data-strat="hybrid"]` → `#kb-hybrid` 顯示、`#kb-savebar.show`。
4. 點 `#kb-save` → `#kb-saved.show`；重讀 localStorage `imarine.settings.v1` 的 `policy.kbs` 該庫 `retrieval.strategy === 'hybrid'`。
5. `#kb-rerank` 勾選且無 rerank 模型時 `#kb-rrguide` 顯示；點 `#kb-goprov` → modal 關閉、模型管理 group 高亮（`ctx.goto` 生效）。
6. 假上傳：以 CDP `DOM.setFileInputFiles` 塞一個暫存 txt → docrow 顯 `indexing…`，3.2 秒後轉 `available`，badge 文件數 +1。
7. `#kb-reset` → confirm 後卡牆回五庫。
8. console 全程零 JS 例外。跑畢 `pkill -f 'remote-debugging-port=9460'`。

- [ ] **Step 7: 檢查點——由使用者 commit**

建議訊息：`feat(settings): 知識庫分區後端不在時退回原版 mock 全套（mountMockKb + MOCK chip）`

---

### Task 3: 模型管理「測試連線」fallback（示範驗證）

**Files:**
- Modify: `src/screens/settings/sections/policy.ts`（插入點 ④：testBtn catch 分支）

**Interfaces:**
- Consumes: 既有 `pmTestedModels`/`modelListHtml`/`stateEl`/`modelsEl`/`saveBtn`/`hintEl`/`prov`（testBtn handler 閉包內既有變數，零新增）
- Produces: 無新符號；行為——真後端失敗時 Setup modal 仍可走完全流程

- [ ] **Step 1: 改 catch 分支**

錨點（PR 版 testBtn handler 的 catch）：
```ts
        } catch {
          stateEl.className = 'tstate err';
          stateEl.textContent = '✗ 連線失敗（確認後端 :8100 與供應商設定）';
        }
```
改為（真後端呼叫失敗 → 退回原版假驗證結果路徑；本地驗證（URL 格式/KEY 必填）在 try 之前，不動）：
```ts
        } catch {
          // 後端不在 → 退回示範驗證（原 mock 流程），訊息帶「示範」低調標示（spec §3.2）
          pmTestedModels = prov.models.length
            ? prov.models
            : (prov.catalog ?? []).map((m) => ({ ...m, enabled: m.kind === 'chat' }));
          stateEl.className = 'tstate ok';
          stateEl.textContent = '✓ 驗證通過（示範）· 已載入 ' + pmTestedModels.length + ' 個模型';
          modelsEl.innerHTML = modelListHtml(pmTestedModels);
          saveBtn.disabled = false;
          hintEl.textContent = '';
        }
```
不加人工延遲——真實 fetch 失敗已消耗 spinner 時間（spec §3.2）。

- [ ] **Step 2: 三綠燈**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```
Expected: 全綠。

- [ ] **Step 3: CDP 驗證（後端不在）**

沿用 Task 2 的 headless Chrome。斷言：
1. 模型管理 group → 點一家未連線供應商的「設定」開 Setup modal。
2. 填合法 URL（如 `https://api.example.com`）+ 任意 KEY → 點測試連線 → spinner 後 `#..tstate` class=`tstate ok`、textContent 含 `（示範）`。
3. 模型清單出現、儲存鈕解鎖 → 儲存 → 供應商卡轉「已連線」。
4. 反向：URL 留 `abc`（非法）→ 顯 `✗ API URL 格式不正確`（本地驗證不動，證明未誤傷）。
5. console 零例外。

- [ ] **Step 4: 檢查點——由使用者 commit**

建議訊息：`feat(settings): 測試連線後端不在時退回示範驗證（訊息帶「示範」）`

---

### Task 4: live modal 檢索策略區塊（存而不用 kbParams）

**Files:**
- Modify: `src/screens/settings/sections/policy-kb-mock.ts`（追加 strategyBlockHtml/bindStrategyBlock）
- Modify: `src/screens/settings/sections/policy.ts`（插入點 ⑤：live kbModalHtml 拼入區塊、openKb 內 load）
- Create（scratch，不進版控）: `<scratchpad>/rag-stub.mjs`

**Interfaces:**
- Consumes: Task 1 `KbParams/defaultKbParams/getKbParams/setKbParams`、Task 2 `stratCardsHtml`（模組私有，同檔可用）、`connectedModels`（`./policy`）、`SettingsCtx`
- Produces:
  - `export function strategyBlockHtml(): string`（id 前綴 `kbp-`，與 mock modal 的 `kb-` 不碰撞）
  - `export interface StrategyBlockHandle { load(sourceId: string): void }`
  - `export function bindStrategyBlock(wrap: HTMLElement, ctx: SettingsCtx): StrategyBlockHandle`

- [ ] **Step 1: `policy-kb-mock.ts` 追加**

```ts
/* ---------- 檢索策略區塊（live modal 用；mock modal 沿用原版內建 kb-* 段） ----------
   live 知識庫（source_id）的策略設定存 'policy.kbParams'，存而不用（後端無 API）。
   id 前綴 kbp- 與 mock 的 kb-* 區隔。 */
export function strategyBlockHtml(): string {
  return (
    '<div class="msec">檢索策略（存於本機，後端支援後生效）</div>' +
    '<div class="frow"><div class="flabel">Embedding 模型</div>' +
    '<div class="fctl"><select class="sel" id="kbp-emb"></select></div></div>' +
    '<div class="strat" id="kbp-strat"></div>' +
    '<div class="subopt" id="kbp-hybrid" style="display:none">' +
    '<div class="rlab"><span>語意權重</span><span id="kbp-wlab">0.6</span><span>關鍵字權重</span></div>' +
    '<input type="range" class="rng" id="kbp-weight" min="0" max="100" value="60"></div>' +
    '<div class="frow" style="margin-top:8px"><div class="flabel">Rerank 重排序</div><div class="fctl">' +
    '<label class="tgl" id="kbp-rrwrap"><input type="checkbox" id="kbp-rerank"><span class="tr"></span><span class="th"></span></label>' +
    '<select class="sel" id="kbp-rrmodel" style="display:none"></select>' +
    '<span class="guide" id="kbp-rrguide" style="display:none">尚無可用 rerank 模型 — <a id="kbp-goprov">先至模型管理設定</a></span>' +
    '</div></div>' +
    '<div class="savebar" id="kbp-savebar"><span>未儲存變更</span><span class="sp"></span>' +
    '<button type="button" class="mini" id="kbp-discard">捨棄</button>' +
    '<button type="button" class="mini acc" id="kbp-save">儲存</button></div>' +
    '<div class="saved" id="kbp-saved">✓ 已儲存</div>'
  );
}

export interface StrategyBlockHandle { load(sourceId: string): void }

export function bindStrategyBlock(wrap: HTMLElement, ctx: SettingsCtx): StrategyBlockHandle {
  const q = <T extends HTMLElement>(sel: string) => wrap.querySelector(sel) as T;
  const chunkIn = q<HTMLInputElement>('#kb-chunk');       // live modal 既有輸入框（上傳參數）
  const ovIn = q<HTMLInputElement>('#kb-overlap');
  const embSel = q<HTMLSelectElement>('#kbp-emb');
  const stratEl = q<HTMLElement>('#kbp-strat');
  const hybridEl = q<HTMLElement>('#kbp-hybrid');
  const weightIn = q<HTMLInputElement>('#kbp-weight');
  const wlabEl = q<HTMLElement>('#kbp-wlab');
  const rerankCk = q<HTMLInputElement>('#kbp-rerank');
  const rrSel = q<HTMLSelectElement>('#kbp-rrmodel');
  const rrGuide = q<HTMLElement>('#kbp-rrguide');
  const savebar = q<HTMLElement>('#kbp-savebar');
  const savedEl = q<HTMLElement>('#kbp-saved');
  let sid: string | null = null;
  let draft: KbParams = defaultKbParams();

  function render(): void {
    const r = draft.retrieval;
    const emb = connectedModels('embedding');
    embSel.innerHTML = emb.length
      ? emb.map((m) => '<option value="' + esc(m) + '"' + (m === r.embeddingModel ? ' selected' : '') + '>' + esc(m) + '</option>').join('')
      : '<option value="">（無可用 embedding 模型）</option>';
    embSel.disabled = !emb.length;
    stratEl.innerHTML = stratCardsHtml(r);
    hybridEl.style.display = r.strategy === 'hybrid' ? '' : 'none';
    weightIn.value = String(r.hybridWeight);
    wlabEl.textContent = (r.hybridWeight / 100).toFixed(1);
    rerankCk.checked = r.rerank;
    const rr = connectedModels('rerank');
    if (r.rerank) {
      if (rr.length) {
        rrSel.style.display = '';
        rrGuide.style.display = 'none';
        rrSel.innerHTML = rr.map((m) => '<option value="' + esc(m) + '"' + (m === r.rerankModel ? ' selected' : '') + '>' + esc(m) + '</option>').join('');
      } else {
        rrSel.style.display = 'none';
        rrGuide.style.display = '';
      }
    } else {
      rrSel.style.display = 'none';
      rrGuide.style.display = 'none';
    }
  }
  function dirty(): void {
    savebar.classList.add('show');
    savedEl.classList.remove('show');
  }

  embSel.addEventListener('change', () => { draft.retrieval.embeddingModel = embSel.value; dirty(); });
  stratEl.addEventListener('click', (e) => {
    const s = (e.target as HTMLElement).closest('[data-strat]') as HTMLElement | null;
    if (!s) return;
    draft.retrieval.strategy = s.getAttribute('data-strat') as Kb['retrieval']['strategy'];
    render();
    dirty();
  });
  weightIn.addEventListener('input', () => {
    draft.retrieval.hybridWeight = Number(weightIn.value);
    wlabEl.textContent = (draft.retrieval.hybridWeight / 100).toFixed(1);
    dirty();
  });
  rerankCk.addEventListener('change', () => { draft.retrieval.rerank = rerankCk.checked; render(); dirty(); });
  rrSel.addEventListener('change', () => { draft.retrieval.rerankModel = rrSel.value; dirty(); });
  q<HTMLElement>('#kbp-goprov').addEventListener('click', () => {
    // 藉 live modal 既有關閉鈕收合（重用 PR 的 closeKb 路徑，含 esc 監聽卸載，不碰其內部）
    q<HTMLElement>('#kb-close').click();
    ctx.goto('policy', '模型管理');
  });
  q<HTMLButtonElement>('#kbp-save').addEventListener('click', () => {
    if (!sid) return;
    draft.chunk = { size: Number(chunkIn.value) || 512, overlap: Number(ovIn.value) || 64 };
    setKbParams(sid, JSON.parse(JSON.stringify(draft)));
    savebar.classList.remove('show');
    savedEl.classList.remove('show');
    void savedEl.offsetWidth;
    savedEl.classList.add('show');
  });
  q<HTMLButtonElement>('#kbp-discard').addEventListener('click', () => { if (sid) load(sid); });

  function load(sourceId: string): void {
    sid = sourceId;
    const saved = getKbParams(sourceId);
    draft = saved ? JSON.parse(JSON.stringify(saved)) : defaultKbParams();
    if (!saved) draft.retrieval.embeddingModel = connectedModels('embedding')[0] ?? '';
    chunkIn.value = String(draft.chunk.size);   // 預填為 additive；上傳仍照 PR 邏輯讀輸入框當下值
    ovIn.value = String(draft.chunk.overlap);
    render();
    savebar.classList.remove('show');
    savedEl.classList.remove('show');
  }
  return { load };
}
```

- [ ] **Step 2: `policy.ts` 插入點 ⑤——live modal 拼入區塊 + openKb load**

(a) import 行（Task 2 已加的那行）擴充：
```ts
import { mountMockKb } from './policy-kb-mock';
```
改為：
```ts
import { bindStrategyBlock, mountMockKb } from './policy-kb-mock';
```

(b) live `kbModalHtml()`（PR 版）錨點：
```ts
    '<div class="fctl"><input class="tin num" id="kb-overlap" type="number" min="0" max="1024" step="16" value="64"></div></div>' +
    '</div></div>'
```
改為：
```ts
    '<div class="fctl"><input class="tin num" id="kb-overlap" type="number" min="0" max="1024" step="16" value="64"></div></div>' +
    strategyBlockHtml() +
    '</div></div>'
```
並把 import 再擴充為：
```ts
import { bindStrategyBlock, mountMockKb, strategyBlockHtml } from './policy-kb-mock';
```

(c) kbGroup custom 內、`const nkWrap = el.querySelector('#nkmodal') as HTMLElement;` 之前（kbWrap 等元素捕捉之後），錨點：
```ts
      const kbUpState = kbWrap.querySelector('#kb-upstate') as HTMLElement;
```
其後插入一行：
```ts
      const kbStrat = bindStrategyBlock(kbWrap, ctx);
```

(d) live `openKb` 錨點：
```ts
        kbUpState.textContent = '';
        kbDocsEl.innerHTML = '<div class="gnote">載入文件…</div>';
```
改為：
```ts
        kbUpState.textContent = '';
        kbStrat.load(s.source_id);   // 檢索策略區塊載入本機參數（存而不用，spec §3.3）
        kbDocsEl.innerHTML = '<div class="gnote">載入文件…</div>';
```

- [ ] **Step 3: 三綠燈**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```
Expected: 全綠。

- [ ] **Step 4: stub server + CDP 驗證（模擬 live）**

`<scratchpad>/rag-stub.mjs`（不進版控）：

```js
import http from 'node:http';
const kbs = [
  { source_id: 'reg_local', source_name: '航港法令庫', source_type: 'regulation', chunk_count: 120, enabled: true, trust_score: 0.9 },
  { source_id: 'up_demo', source_name: '自建示範庫', source_type: 'uploaded', chunk_count: 8, enabled: true, trust_score: 0.7 },
];
const docs = { up_demo: [{ id: 1, filename: 'demo.txt', raw_format: 'txt', fetched_at: '2026-07-09', chunk_count: 8 }], reg_local: [] };
http.createServer((req, res) => {
  const send = (o, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(o));
  };
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/sources') return send(kbs);
  const m = u.pathname.match(/^\/api\/kb\/([^/]+)\/documents$/);
  if (m) return send(docs[m[1]] ?? []);
  return send({ detail: 'not found' }, 404);
}).listen(8100, () => console.log('rag-stub on :8100'));
```

```bash
node <scratchpad>/rag-stub.mjs &
```

CDP 斷言（live 情境）：
1. 進 settings → 政策報告：卡牆 = 2 真實庫 + 新增卡；**無 MOCK chip**（`.gbadge.wait` 不存在）；badge 顯 `2 庫 · 128 段`。
2. 點「自建示範庫」開 modal：文件列 `demo.txt · 8 段`（PR 行為不迴歸）；**`#kbp-strat` 存在且 3 張策略卡**。
3. 切 `hybrid` → `#kbp-hybrid` 顯示 → 拖 weight → `#kbp-savebar.show` → 點 `#kbp-save` → localStorage `imarine.settings.v1` 內 `policy.kbParams.up_demo.retrieval.strategy === 'hybrid'`。
4. 關 modal 重開 → 策略區塊預填 hybrid、chunk 輸入框預填已存值（round-trip）。
5. `#kbp-rerank` 勾選無模型 → `#kbp-rrguide` 顯示 → 點 `#kbp-goprov` → modal 關閉 + 跳模型管理。
6. 殺掉 stub（`kill %1`）→ 重載頁面重進分區 → 退回 mock 卡牆 + MOCK chip（Task 2 行為，證明 per-call probe）。
7. console 全程零例外。跑畢清 stub 與 Chrome 進程。

- [ ] **Step 5: 檢查點——由使用者 commit**

建議訊息：`feat(settings): live 知識庫 modal 檢索策略區塊（policy.kbParams 存而不用）`

---

### Task 5: 全站驗收 + 「PR 功能不動」驗證 + 文件收尾

**Files:**
- Modify: `HANDOFF.md`（第 1 節加本輪狀態、第 4 節下一步）
- 不動任何產品碼（純驗收；發現缺陷停下回報，不自行修）

**Interfaces:**
- Consumes: Task 1-4 全部產出
- Produces: 驗收報告（scratch）、HANDOFF 更新

- [ ] **Step 1: 三綠燈**

```bash
npx tsc --noEmit    # 0 errors
npx vitest run      # 18 檔 65 tests 全綠（63 既有 + kb-params 2）
npm run build       # 成功
```

- [ ] **Step 2: 「PR 功能不動」diff 驗證**

```bash
git diff origin/feat/policy-rag-integration...HEAD --stat
```
Expected：只有 `sections/policy.ts`（插入點 ①-⑤）、`sections/policy-kb-mock.ts`（新檔）、`tests/settings-kb-params.test.ts`（新檔）、docs（spec/plan/HANDOFF）。以下必須零 diff：
```bash
git diff origin/feat/policy-rag-integration...HEAD -- \
  src/data/exchange/policy.ts src/screens/settings/backend.ts \
  src/screens/policy src/data/types.ts src/main.ts src/screens/settings/settings.css
```
Expected: 空輸出。再逐行檢視 `git diff origin/feat/policy-rag-integration...HEAD -- src/screens/settings/sections/policy.ts`，確認僅含 ①`export setKbs` ②`custom(el, ctx)` ③`refresh(initial)`+import ④testBtn catch ⑤modal 拼接+bind+load。

- [ ] **Step 3: CDP 全站迴歸（後端全關：rag-agent 與 carbon 皆不起）**

8 頁 sweep（hero→carbon→policy→twin→dispatch→epidemic→alert→settings）：逐頁 `.screen.active` 正確、版面非空；settings 政策報告分區呈 mock 卡牆 + MOCK chip；policy 頁綜合對話退 mock 情報聯集（PR 既有 fallback 不迴歸）；模型管理測試連線顯（示範）；**console 全程零 JS 例外**；settings 輸入框內打 `1`-`7` 不跳頁（既有 bail-out）。`prefers-reduced-motion: reduce` 模擬下 settings 分區完整渲染非空白。

- [ ] **Step 4: HANDOFF.md 更新**

第 1 節頂部加本輪段落（分支 `policy-mock-fallback`、base PR #1 head `9033aba`、三 task 成果、驗收證據、「PR 功能不動」diff 驗證結果、待 whole-branch review + 使用者實機驗收 + PR 合併順序：**PR 先進 main、本分支跟進**）；第 4 節下一步同步。順帶修正第 1 節 hero 段落已過時的「待 finishing」敘述（hero 實際已合併 push，見 git log `4bd2be3`）。

- [ ] **Step 5: 檢查點——由使用者 commit**

建議訊息：`docs(policy-mock): 全站驗收 + HANDOFF 收尾`

---

## Self-Review 紀錄

- **錨點實測（2026-07-09，對 `origin/feat/policy-rag-integration` 實檔逐一 grep）**：插入點 ①-⑤ 的錨點字串各恰好 1 次命中。注意 `    custom(el) {` 單行出現 2 次（另一處為 llmGroup），**Task 2 Step 2 必須用雙行錨**（`custom(el) {` + `let sources: BackendSource[] = [];`，實測唯一）。testBtn catch 閉包變數（`stateEl`/`modelsEl`/`saveBtn`/`hintEl`/`prov`/`pmTestedModels`）全數確認在 scope。`esc()` 自帶版與原版行為等價（同逃脫 `&<>"`）。

- **Spec coverage**：§3.1→Task 2、§3.2→Task 3、§3.3→Task 4、§4 契約→Task 1、§6 驗收→各 task Step + Task 5、§5 衝突面→Global Constraints + Task 5 Step 2。settings.css 一項與 spec 有偏差：實查 `.gbadge.wait` 既有變體可直接用，settings.css 零改動（比 spec 更小，已在背景速讀註明）。
- **Placeholder scan**：無 TBD/TODO；所有程式碼步驟含完整程式碼；CDP 斷言逐條列出。
- **Type consistency**：`KbParams`/`defaultKbParams`/`getKbParams`/`setKbParams`（Task 1 定義、Task 4 使用）、`mountMockKb(el, ctx)`（Task 2 定義、插入點 ③ 使用）、`strategyBlockHtml`/`bindStrategyBlock`/`StrategyBlockHandle`（Task 4 定義與使用）、`stratCardsHtml`（Task 2 定義、Task 4 同檔使用）簽名一致；`custom(el, ctx)` 與 renderer.ts:36 的呼叫相符。

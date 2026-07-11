# 數位員工入口與設定整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hero 封面 chips 加入數位員工入口（六變七）+ settings 新增「數位員工」有限生效分區（Gemini key/model/測試連線/sourceMode/autoPatrol）+ agent 端三個讀取點改走新 `config.ts`。

**Architecture:** 新增 `src/screens/agent/config.ts` 三個純讀取函式（settings → env fallback）作為唯一真相；settings 分區照 schema 驅動框架新增一檔一註冊；hero 只拆一個變數。spec：`docs/superpowers/specs/2026-07-11-agent-hero-settings-design.md`。

**Tech Stack:** Vite + vanilla TS、vitest、settings schema 框架（`src/screens/settings/schema.ts`）、`@google/genai`（僅動態 import）。

## Global Constraints

- 遵守 CLAUDE.md CORE RULE：不做順手清理、不加 emoji、commit 訊息無 Claude 署名。
- 元件用 Liquid Glass Kit 既有 class，不手寫 backdrop-filter。
- 只換讀取點，不動 agent 引擎邏輯（replay.ts/tools.ts/diagnostics.ts/workspace.ts 零改動）。
- settings 分區的 `@google/genai` 只能動態 `import()`（避免 SDK 進 settings chunk；build 後驗證）。
- 模型預設值字串統一 `'gemini-2.5-flash'`。
- 每 task 結尾三綠燈局部驗證：`npx tsc --noEmit`、`npx vitest run`、（Task 3 起）`npm run build`。

---

### Task 1: `agent/config.ts` 三純函式 TDD

**Files:**
- Create: `src/screens/agent/config.ts`
- Test: `tests/agent-config.test.ts`

**Interfaces:**
- Consumes: `getSetting` from `src/screens/settings/storage.ts`（`getSetting<T>(key, fallback): T`；node 環境自動退記憶體 store）。
- Produces（後續 task 依賴的精確簽名）:
  - `effectiveKey(env?: Record<string, string | undefined>): string` — settings `agent.geminiKey`（trim 後非空）優先，否則 `env.VITE_GEMINI_API_KEY`，否則 `''`。
  - `effectiveModel(): string` — `getSetting('agent.model', 'gemini-2.5-flash')`，空字串亦退預設。
  - `isLive(env?): boolean` — `agent.sourceMode === 'mock'` 一律 false；否則 `!!effectiveKey(env)`。
  - env 參數預設 `import.meta.env`；測試傳明確物件，不受使用者本機 `.env` 影響。

- [ ] **Step 1: 寫失敗測試**

`tests/agent-config.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setSetting } from '../src/screens/settings/storage';
import { effectiveKey, effectiveModel, isLive } from '../src/screens/agent/config';

// 每案重置相關 settings key（storage 在 node 退記憶體，跨案殘留要清）
beforeEach(() => {
  setSetting('agent.geminiKey', '');
  setSetting('agent.model', '');
  setSetting('agent.sourceMode', 'auto');
});

describe('effectiveKey', () => {
  it('settings 覆寫 env', () => {
    setSetting('agent.geminiKey', 'sk-from-settings');
    expect(effectiveKey({ VITE_GEMINI_API_KEY: 'sk-from-env' })).toBe('sk-from-settings');
  });
  it('settings 空 → 退 env', () => {
    expect(effectiveKey({ VITE_GEMINI_API_KEY: 'sk-from-env' })).toBe('sk-from-env');
  });
  it('兩者皆無 → 空字串', () => {
    expect(effectiveKey({})).toBe('');
  });
  it('settings 純空白視同空', () => {
    setSetting('agent.geminiKey', '   ');
    expect(effectiveKey({ VITE_GEMINI_API_KEY: 'sk-env' })).toBe('sk-env');
  });
});

describe('effectiveModel', () => {
  it('未設定 → 預設 gemini-2.5-flash', () => {
    expect(effectiveModel()).toBe('gemini-2.5-flash');
  });
  it('已設定 → 讀 settings', () => {
    setSetting('agent.model', 'gemini-2.5-pro');
    expect(effectiveModel()).toBe('gemini-2.5-pro');
  });
});

describe('isLive', () => {
  it('sourceMode=mock → 有 key 也 false', () => {
    setSetting('agent.sourceMode', 'mock');
    setSetting('agent.geminiKey', 'sk');
    expect(isLive({ VITE_GEMINI_API_KEY: 'sk-env' })).toBe(false);
  });
  it('auto + settings key → true', () => {
    setSetting('agent.geminiKey', 'sk');
    expect(isLive({})).toBe(true);
  });
  it('auto + 只有 env key → true', () => {
    expect(isLive({ VITE_GEMINI_API_KEY: 'sk-env' })).toBe(true);
  });
  it('auto + 無 key → false', () => {
    expect(isLive({})).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/agent-config.test.ts`
Expected: FAIL（`Cannot find module '../src/screens/agent/config'`）

- [ ] **Step 3: 最小實作**

`src/screens/agent/config.ts`：

```ts
/* 數位員工設定讀取（spec 2026-07-11 §4）— settings 覆寫 .env 的唯一真相。
   agent.geminiKey / agent.model / agent.sourceMode 由 settings「數位員工」分區寫入；
   env 參數可注入供測試（預設 import.meta.env），不動 agent 引擎邏輯。 */
import { getSetting } from '../settings/storage';

type Env = Record<string, string | undefined>;
const metaEnv: Env = (import.meta as any).env ?? {};

export function effectiveKey(env: Env = metaEnv): string {
  const s = String(getSetting('agent.geminiKey', '') ?? '').trim();
  return s || env.VITE_GEMINI_API_KEY || '';
}

export function effectiveModel(): string {
  return getSetting('agent.model', '') || 'gemini-2.5-flash';
}

export function isLive(env: Env = metaEnv): boolean {
  if (getSetting('agent.sourceMode', 'auto') === 'mock') return false;
  return !!effectiveKey(env);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/agent-config.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 5: 全量驗證 + commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors / 全綠（25 檔 118 tests：既有 24 檔 108 + 本檔 10）

```bash
git add src/screens/agent/config.ts tests/agent-config.test.ts
git commit -m "feat(agent): config.ts 設定讀取三純函式（settings 覆寫 env）TDD"
```

---

### Task 2: settings「數位員工」分區 + 註冊

**Files:**
- Create: `src/screens/settings/sections/agent.ts`
- Modify: `src/screens/settings/index.ts`（import + SECTIONS 陣列 `alertSection` 後插入）
- Test: `tests/settings-agent-section.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `effectiveKey()/effectiveModel()/isLive()`；schema 的 `SettingsSection`/`ActionResult`；storage 的 `getSetting`/`subscribe`；`friendlyError(raw): { message, detail? }`（動態 import 自 `../../agent/loop`）。
- Produces: `export const agentSection: SettingsSection`（id `'agent'`）。

- [ ] **Step 1: 寫失敗測試（分區契約）**

`tests/settings-agent-section.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { agentSection } from '../src/screens/settings/sections/agent';

const allFields = () => agentSection.groups.flatMap((g) => g.fields ?? []);

describe('settings agent section 契約', () => {
  it('分區 id/色彩', () => {
    expect(agentSection.id).toBe('agent');
    expect(agentSection.color).toBe('#B48CFF');
  });
  it('geminiKey 為 password kind', () => {
    const f = allFields().find((x) => 'key' in x && x.key === 'agent.geminiKey');
    expect(f?.kind).toBe('password');
  });
  it('model 為 select、預設 flash 為第一選項、共三選項', () => {
    const f = allFields().find((x) => 'key' in x && x.key === 'agent.model');
    expect(f?.kind).toBe('select');
    const opts = (f as { options: () => { value: string }[] }).options();
    expect(opts.map((o) => o.value)).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']);
  });
  it('sourceMode 為 select（auto/mock）', () => {
    const f = allFields().find((x) => 'key' in x && x.key === 'agent.sourceMode');
    expect(f?.kind).toBe('select');
    const opts = (f as { options: () => { value: string }[] }).options();
    expect(opts.map((o) => o.value)).toEqual(['auto', 'mock']);
  });
  it('autoPatrol 為 toggle 且 defaultOn', () => {
    const f = allFields().find((x) => 'key' in x && x.key === 'agent.autoPatrol');
    expect(f?.kind).toBe('toggle');
    expect((f as { defaultOn?: boolean }).defaultOn).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/settings-agent-section.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作分區**

`src/screens/settings/sections/agent.ts`：

```ts
import { getSetting, subscribe } from '../storage';
import { effectiveKey, effectiveModel, isLive } from '../../agent/config';
import type { SettingsSection, ActionResult } from '../schema';

/* 數位員工分區（spec 2026-07-11 §3）— 全欄位有限生效，零佔位。
   測試連線動態 import @google/genai 與 friendlyError（皆屬 agent async chunk 的依賴，
   不讓 SDK 進 settings chunk）；key 空時短路不打 API。 */
async function testGemini(): Promise<ActionResult> {
  const key = effectiveKey();
  if (!key) return { ok: false, message: '未設定 key——填入上方欄位或於 .env 設定' };
  const model = effectiveModel();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4000);
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    await ai.models.generateContent({
      model, contents: 'ping',
      config: { maxOutputTokens: 1, abortSignal: ac.signal },
    });
    clearTimeout(t);
    return { ok: true, message: '連線成功 · ' + model };
  } catch (e) {
    clearTimeout(t);
    const { friendlyError } = await import('../../agent/loop');
    return { ok: false, message: friendlyError(String((e as Error)?.message ?? e)).message };
  }
}

export const agentSection: SettingsSection = {
  id: 'agent',
  label: '數位員工',
  color: '#B48CFF',
  status: () => (isLive() ? 'GEMINI LIVE' : '劇本 MOCK'),
  groups: [
    {
      title: 'Gemini 連線', badge: '生效中', badgeTone: 'live', saveMode: 'explicit',
      fields: [
        { kind: 'password', key: 'agent.geminiKey', label: 'Gemini API Key', help: '留空使用 .env 的 VITE_GEMINI_API_KEY；僅存本機瀏覽器（localStorage），勿在共用電腦填入' },
        { kind: 'select', key: 'agent.model', label: '模型', options: () => [
          { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash（預設）' },
          { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
          { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
        ], help: '對話與測試連線共用；儲存後即生效' },
        { kind: 'action', label: '連線驗證', button: '測試連線', run: testGemini },
      ],
    },
    {
      title: '行為', badge: '即時生效', badgeTone: 'live', saveMode: 'instant',
      fields: [
        { kind: 'select', key: 'agent.sourceMode', label: '資料源模式', options: () => [
          { value: 'auto', label: '自動（有 key 走 GEMINI LIVE）' },
          { value: 'mock', label: '強制劇本 MOCK' },
        ], help: 'demo 想展示確定性劇本時不用刪 key' },
        { kind: 'toggle', key: 'agent.autoPatrol', label: '進頁自動巡檢', defaultOn: true, help: '關閉後首次進頁略過健檢動畫；切換後重新整理生效' },
      ],
    },
    {
      title: '狀態', badge: '唯讀', saveMode: 'instant',
      custom(el) {
        /* custom() 每次切回本分區都重跑，subscribe 無 teardown hook——
           render 先檢查 el.isConnected，detach 後首次回呼自動退訂，防止累積 */
        const off: Array<() => void> = [];
        const render = () => {
          if (!el.isConnected) { off.forEach((f) => f()); off.length = 0; return; }
          const live = isLive();
          const src = String(getSetting('agent.geminiKey', '') ?? '').trim() ? '設定頁'
            : (effectiveKey() ? '.env' : '無');
          el.innerHTML = '<div class="gnote">' + (live
            ? 'GEMINI LIVE（key 來源：' + src + '）· 模型 ' + effectiveModel()
            : '劇本 MOCK（' + (getSetting('agent.sourceMode', 'auto') === 'mock' ? '強制' : '無 key') + '）') + '</div>';
        };
        render();
        off.push(subscribe('agent.geminiKey', render));
        off.push(subscribe('agent.sourceMode', render));
        off.push(subscribe('agent.model', render));
      },
    },
  ],
};
```

- [ ] **Step 4: 註冊分區**

`src/screens/settings/index.ts` 兩處：import 區（`alertSection` 之後）加

```ts
import { agentSection } from './sections/agent';
```

`SECTIONS = [...]` 陣列 `alertSection,` 之後（順序對齊 rail：alert → agent）加

```ts
      agentSection,
```

- [ ] **Step 5: 跑測試確認通過 + 全量驗證**

Run: `npx vitest run tests/settings-agent-section.test.ts && npx tsc --noEmit && npx vitest run`
Expected: 契約 5 tests PASS；tsc 0；全綠（26 檔 123 tests）

- [ ] **Step 6: Commit**

```bash
git add src/screens/settings/sections/agent.ts src/screens/settings/index.ts tests/settings-agent-section.test.ts
git commit -m "feat(settings): 數位員工分區（Gemini key/model/測試連線/sourceMode/autoPatrol）"
```

---

### Task 3: agent 端接線（index.ts / controller.ts / loop.ts 只換讀取點）

**Files:**
- Modify: `src/screens/agent/index.ts`（`hasKey` → `isLive`、chip subscribe、autoPatrol gating、`greet` 支援 null）
- Modify: `src/screens/agent/controller.ts:17-18`（刪 `env`/`hasKey`）、`controller.ts:383-385`（分派改 `isLive()` + 傳 `effectiveKey()/effectiveModel()`）、檔頭註解第 4 行 `hasKey()` 字樣同步更新
- Modify: `src/screens/agent/loop.ts:11`（刪 `MODEL` 常數，`runGemini` opts 加 `model?`）、`friendlyError` 金鑰文案補「設定頁」
- Test: 既有 `tests/agent-plan.test.ts` 不需改（斷言 `toContain('金鑰')` 不受文案微調影響）；本 task 行為屬 DOM/分派層，由 Task 5 CDP 驗收

**Interfaces:**
- Consumes: Task 1 的 `effectiveKey()/effectiveModel()/isLive()`。
- Produces: `runGemini(opts: { apiKey: string; model?: string; tools; history; userText; io })`——`model` 缺省 `'gemini-2.5-flash'`。

- [ ] **Step 1: loop.ts 改 model 參數 + friendlyError 文案**

刪第 11 行 `const MODEL = 'gemini-2.5-flash';`。`runGemini` opts 型別加 `model?: string`：

```ts
export async function* runGemini(opts: {
  apiKey: string; model?: string; tools: AgentTool[]; history: unknown[]; userText: string; io: EngineIO;
}): AsyncGenerator<AgentEvent> {
```

函式開頭（`const ai = ...` 附近）加 `const model = opts.model ?? 'gemini-2.5-flash';`，`generateContentStream({ model: MODEL, ...` 改 `model,`。

`friendlyError` 金鑰分支文案改（key 現可來自設定頁，原文案誤導）：

```ts
    return { message: 'Gemini 金鑰無效或未授權——檢查系統設定「數位員工」分區或 .env 的 key' };
```

- [ ] **Step 2: controller.ts 換分派讀取點**

第 12 行 import 區加：

```ts
import { effectiveKey, effectiveModel, isLive } from './config';
```

刪第 17-18 行：

```ts
const env = (import.meta as any).env ?? {};
const hasKey = () => !!env.VITE_GEMINI_API_KEY;
```

（先 `grep -n "env\.\|hasKey" src/screens/agent/controller.ts` 確認僅此兩處 + 384 行使用後再刪。）

第 383-385 行分派改：

```ts
    const gen = isLive()
      ? runGemini({ apiKey: effectiveKey(), model: effectiveModel(), tools, history, userText: text, io })
      : runScenario(matchScenario(text, scenarios) ?? { id: 'fb', patterns: [], events: FALLBACK_EVENTS }, io);
```

檔頭註解第 4 行「雙態分派：hasKey() → runGemini（live）；否則 runScenario（劇本 mock）。」改「雙態分派：isLive()（config.ts，settings 覆寫 env）→ runGemini（live）；否則 runScenario（劇本 mock）。」

- [ ] **Step 3: index.ts 換 chip 讀取點 + subscribe + autoPatrol + greet(null)**

import 區：`prefersReduced` 那行改為

```ts
import { getSetting, prefersReduced, subscribe } from '../settings/storage';
```

並加 `import { isLive } from './config';`。刪第 23 行 `const hasKey = ...`。

`mount()` 內 `screenHeader({...})` 的兩行改：

```ts
      source: isLive() ? 'live' : 'mock',
      sourceLabel: isLive() ? 'GEMINI LIVE' : '劇本 MOCK',
```

`mount()` 尾（`createController({...})` 之後）加 chip 即時刷新（訂 geminiKey/sourceMode 兩 key，model 不影響 chip 不訂；mount 全 app 生命週期只跑一次，不需退訂）：

```ts
    // 設定頁改 key/sourceMode → 標題列 LIVE/MOCK chip 即時跟隨（spec 2026-07-11 §4）
    const updateChip = () => {
      const chip = el.querySelector('header .src') as HTMLElement | null;
      if (!chip) return;
      const live = isLive();
      chip.className = live ? 'src live' : 'src';
      chip.innerHTML = '<i></i>' + (live ? 'GEMINI LIVE' : '劇本 MOCK');
    };
    subscribe('agent.geminiKey', updateChip);
    subscribe('agent.sourceMode', updateChip);
```

`greet` 簽名改 `function greet(rep: DiagReport | null): void`，statusLine 組字改三分支（rep 為 null 走無健檢文案；`entries`/`okCount`/`mockCount`/`bad` 移入 rep 非空分支）：

```ts
function greet(rep: DiagReport | null): void {
  let statusLine: string;
  if (rep) {
    const entries = Object.entries(rep.modules) as [AgentModule | 'settings', DiagModuleReport][];
    const okCount = entries.filter(([, v]) => v.status === 'ok').length;
    const mockCount = entries.filter(([, v]) => v.status === 'mock').length;
    const bad = entries.filter(([, v]) => v.status === 'down' || v.status === 'degraded');
    statusLine = bad.length
      ? `已完成系統巡檢：發現 <b style="color:#F0648C">${bad.length} 項異常</b>（${bad.map(([id]) => moduleName(id)).join('、')}），建議跟我說「跑一次完整系統健檢」看修復步驟。`
      : `已完成系統巡檢：<b style="color:#35E0A6">${entries.length} 個模組全部在線</b>（${okCount} live / ${mockCount} 示範）。`;
  } else {
    statusLine = '自動巡檢已停用（可於系統設定「數位員工」分區開啟），需要時可跟我說「跑一次完整系統健檢」。';
  }
  // …以下 thread/chips/input 段不動
```

`show()` 的 boot 分支改（autoPatrol 於 boot 判定一次；off 時不跑 probe/燈牆，greet(null) 照樣給招呼 + chips）：

```ts
  async show() {
    if (booted) { if (lastDiag) ws.showDiag(lastDiag, false); return; } // 重入顯示上次終態
    booted = true;
    if (getSetting('agent.autoPatrol', true)) {
      lastDiag = await runDiagnostics(ctxRef);
      ws.showDiag(lastDiag, !prefersReduced());
      greet(lastDiag);
    } else {
      greet(null); // 巡檢停用：略過 probe 與燈牆動畫，招呼 + chips 照顯（spec §3 Group 2）
    }
  },
```

檔頭註解第 2-3 行補一句「autoPatrol=off 時 boot 略過巡檢（greet(null)），切換後重新整理生效」。

- [ ] **Step 4: 三綠燈驗證**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 0 errors / 26 檔 123 tests 全綠 / build 成功。

build 後 chunk 驗證（settings chunk 不得含 genai SDK）：

Run: `grep -l "GoogleGenAI" dist/assets/*.js`
Expected: 僅 agent chunk 與 genai 自身 chunk 命中，settings chunk（grep "數位員工分區" 或以 build log 對照）不命中。

- [ ] **Step 5: Commit**

```bash
git add src/screens/agent/index.ts src/screens/agent/controller.ts src/screens/agent/loop.ts
git commit -m "feat(agent): 三讀取點改走 config.ts（chip subscribe / autoPatrol / model 參數）"
```

---

### Task 4: hero 封面 chips 六變七

**Files:**
- Modify: `src/screens/hero/index.ts:62-73`（mount 內 `mods` 拆兩條）+ 檔頭註解第 4 行

**Interfaces:**
- Consumes: `SCREENS`（registry 順序：0 hero…6 alert、7 agent、8 settings）。
- Produces: 無（葉節點改動）。

- [ ] **Step 1: 拆 chips/卡片來源**

`mount()` 內：

```ts
    const chipMods = SCREENS.slice(1, 8); // 六功能 + agent 進封面 chips
    const cardMods = SCREENS.slice(1, 7); // 總覽儀表牆維持六卡 3×2
    const chipsHtml = chipMods.map(chip).join('');
    const cardsHtml = cardMods
      .map((def, i) => {
        const m = snap.modules.find((x) => x.id === def.id);
        return m ? modCard(def, m, i) : '';
      })
      .join('');
```

檔頭註解第 4-5 行「封面六 chips 與總覽六卡皆由 SCREENS.slice(1, 7) 動態生成（settings 第 8 筆不進 hero）」改「封面 chips 取 SCREENS.slice(1, 8)（六功能 + agent），總覽六卡取 slice(1, 7)（agent 進 chips 不進儀表牆；settings 兩者皆不進）」。

`hero.html`/`hero.css`/`overview.json` 零改動（`.hchips` 為 flex-wrap，第七顆自然排入；觀感於 Task 5 CDP 截圖判斷）。

- [ ] **Step 2: 驗證 + Commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors / 全綠

```bash
git add src/screens/hero/index.ts
git commit -m "feat(hero): 封面 chips 加入數位員工（六變七），儀表牆六卡不動"
```

---

### Task 5: 全站驗收 + HANDOFF 收尾

**Files:**
- Modify: `HANDOFF.md`（本輪段落）
- 產品碼零改動（驗收發現缺陷則回報，不擅修）

**Interfaces:**
- Consumes: Task 1-4 全部成果。

- [ ] **Step 1: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 0 / 26 檔 123 tests 全綠 / build ok

- [ ] **Step 2: CDP 全站迴歸（獨立 headless Chrome + SwiftShader，勿加 `--disable-gpu`；自起 dev server 於未占用埠，不動使用者的 :5173/:8000；mock 態用 `VITE_GEMINI_API_KEY=` 空值 override 另起，不動 `.env`）**

驗收清單（spec §5）：
1. hero 封面七 chips：第七顆「數位員工」紫 `#B48CFF`、點擊跳 agent 頁；Enter → 總覽儀表牆仍六卡 3×2；封面 chips 換行觀感截圖留檔。
2. settings 出現「數位員工」分區（alert 之後）：三 group 渲染、geminiKey 遮罩、explicit 儲存/捨棄語意、狀態唯讀列正確。
3. 設定頁填 dummy key（如 `dummy-invalid-key`）→ 切 agent 頁 chip 即時轉「GEMINI LIVE」（subscribe 生效）→ 送指令走 live 路徑、Gemini 真回 400、friendlyError 新文案上牆（含「系統設定」字樣）。
4. `agent.sourceMode=mock` + 留著 dummy key → chip 即時轉「劇本 MOCK」、送指令走劇本。
5. 測試連線：清空 key（且無 env key 的 server）按鈕 → 「未設定 key」；dummy key → 金鑰無效訊息。
6. `agent.autoPatrol=off` + 重新整理 → agent 首次進頁：無 probe 燈牆動畫、招呼泡泡帶「自動巡檢已停用」文案、3 chips 照顯可點；`=on` + 重新整理 → 巡檢恢復。
7. 9 頁 sweep：鍵盤 `0`-`8` 全對映、各頁 `.screen.active` + 版面非空、`#aInput` 打數字不跳頁。
8. console 全程零 JS 例外。

- [ ] **Step 3: 真實 key 留使用者實機驗**

dummy key 只驗錯誤路徑與模式切換；「設定頁 key 的完整成功對話 + 測試連線成功訊息」留使用者以自己的 Gemini key 驗證，驗收報告誠實註記。

- [ ] **Step 4: HANDOFF.md 更新 + Commit**

首行「最後更新」+ 第 1 節新增本輪段落（成果檔案、驗收誠實分野、殘留事項）。

```bash
git add HANDOFF.md
git commit -m "docs(handoff): hero agent chip + settings 數位員工分區驗收收尾"
```

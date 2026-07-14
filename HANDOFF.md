# HANDOFF — iMarine-FrontEnd

> 活文件：目前進度、決策紀錄、下一步。接手先讀這份，再讀 `CLAUDE.md`。

最後更新：2026-07-15 **Twin 停船朝向穩定化（修原地打轉）+ 船隻跟隨模式（Cities: Skylines 式）+ 時間軸 ×1 凍結修復**——SDD 5 tasks 全數完成、逐 task review 全綠、最終 opus whole-branch review = Ready to merge；使用者本機目視確認手感後，**已 fast-forward 合併回 main 並 push origin/main**。分支 `twin-heading-follow`（自 main `e95fbe0`）合併後刪除。落地：①`src/screens/twin/time/heading.ts` 純函式載入時逐點預算「穩定朝向 + 靠泊鎖定」（停船不再逐點抖轉，貼碼頭鎖切線且不掉頭、錨地保持進來航向；任一時刻朝向是 tMs 的確定性純函式）；②`scene-init.ts` `updateShips` 朝向改查預算、`pickShipAt` 加 mmsi + 逐時刻靠泊狀態；③`scene-init.ts` `follow(mmsi,onEnd)`/`unfollow()`——tween 進場 + 每幀把 `controls.target` 與相機等量平移鎖定船位（環繞/縮放不被覆蓋），船被篩掉/scrub 出範圍自動退出；④`index.ts` 點船→chip「再點一次跟隨」→同船再點進入跟隨，Esc/點空白/換船/切未來推演分頁/視角預設鈕退出 + `twin.css` chip 跟隨態。**⑤時間軸 ×1 凍結修復（本輪追加，`298dbb9`）**：根因＝播放迴圈把 step-snapped 的 `slider.value` 當累加器，×1 每幀增量（range/7200≈12100ms）小於 replay slider 半格（30000ms）被 range input 四捨五入回原值→凍結（headless Chromium 實測 deltaMs=0；jsdom 不 snap 故重現不出、單元測試無法覆蓋此整合面）。修法＝`time/playback.ts` 新增純函式 `advancePlayhead`（float 播放頭 + wrap），`timeline.ts` 改用 float `playHead` 累加器（`sync()` 未動、render 對齊 60s 格）；同時把 `advancePerFrame` 除數 `4800→7200`（整體播放慢 1/3，×1~×10 相對關係不變）。回歸測試 `tests/twin-playback.test.ts`（3 案例，釘死 /7200 慢 1/3 + 播放頭前進非零 + wrap）。修後 headless 實測 ×1 `moved=true, deltaMs=60000`（float 累加器跨過 snap 門檻）。**驗收（誠實分野）**：`npm run check` 三綠燈（tsc 0 / vitest 31 檔 154 tests / build ok，新增 twin-heading 8 + twin-playback 3）；headless SwiftShader 實測——朝向恆定斷言（mmsi=416014513 靠泊段 5 取樣 spread=**0.00e+0 rad**、零 pageerror）+ 跟隨鎖定 smoke（target 鎖船心 dx=dz=**0.000**、unfollow 乾淨、零 pageerror）+ ×1 播放解凍皆 PASS；使用者本機目視確認停船不打轉/跟隨手感/×1 速度手感 OK。spec：`docs/superpowers/specs/2026-07-14-twin-heading-follow-design.md`；plan：`docs/superpowers/plans/2026-07-14-twin-heading-follow.md`。**殘留（誠實記錄，非缺陷）**：`timeline.ts:4` 檔頭註解仍寫舊公式 `rangeMs*step/4800`（本輪改成 `advancePlayhead`＋`/7200`）——依 CORE RULE 未擅自改註解，待使用者決定是否更新。

**（以下為前一輪「PR #2 merge 後全面驗收」，已 commit 並 push origin main，敘述保留於下方）**

原「最後更新」：2026-07-13 **PR #2 merge 後全面驗收 + 4 findings 全數修復並 push 後端**——協作者 PR #2（policy 晨報 live + 排程 + embedding 設定 + 報告匯出）已 merge（`0ea4762`），owner 本機以 Gemini（OpenAI 相容端點）替代 NCHC 金鑰做完整測試，全功能通過；4 個 findings（①②③④）**已直接在後端 repo 修好、commit `acf5550` push 上 `NCHU-ICTALab/iMarine-rag-backend` main**（經 owner 授權直接 push），逐一實測通過。前端側只補契約文件（`docs/collab/policy.md` §4 魔術值 + §8 變更列），**留工作區未 commit，待 owner 自行 commit**。詳見「## -1. 驗收輪」。

---

## -1. 驗收輪（2026-07-13）PR #2 merge 後完整測試

> 環境：後端 `../iMarine-rag-backend`（clone 自 GitHub）+ pgvector 容器 `imarine-pg`（:5544，具名 volume `imarine_pg_data`）+ `.env` 用 owner 的 Gemini key 走 OpenAI 相容端點（LLM=`gemini-2.5-flash-lite`、embed=`gemini-embedding-001` 3072 維；`.env`/`uv.lock` 皆 gitignore，勿提交）。**4 findings 已於後端 commit `acf5550` 全修並 push main**（原先 ①② 的本地補丁已正式化進該 commit，無殘留未 commit 補丁）。

**通過項**：前端 `npm run check` 三綠燈；`verify:contract -- policy` **4/4 PASS**（成功路徑，PR 原本未驗）；`verify:live -- policy` **3/3 PASS**；ingest 8 來源 487 chunks；`reembed` 端點實測（487 段、3072 維、HNSW 超維自動略過）；晨報 live 生成（grounding 100%、6 重點附引用、id=`day-live`/type=`daily` 與前端魔術值一致）；「更新新聞」按鈕全流程（重生成→置頂→自動切卡→右欄同步）；晨報 chip 提問走真 `/api/chat`（live · 引用 8 筆、右欄換成答案來源）；設定頁排程區雙向同步（啟用→「下次 2026-07-14 06:30」、後端狀態一致，測畢已還原停用）；設定頁 embedding 區讀到 live 狀態＋測試連線分類訊息；產報告（四章節、coverage 100%）＋報告卡「下載 Markdown」內容正確（標題/模型註記/章節/參考來源）＋「列印/存 PDF」有觸發原生列印；後端掛掉/LLM 5xx 時前端 fallback 訊息皆正確、demo 不掛。

**Findings（全數已修，後端 commit `acf5550`，依嚴重度）**：
1. ✅ **後端 `_embed_api` 不分批**（`indexing/embedding.py`）——整份 chunks 一次 POST `/embeddings`，Gemini 上限 100 筆/請求直接 400（NCHC/bge-m3 碰巧吃得下所以協作者沒踩到）。**已修**：按 `BATCH_SIZE=64` 分批迴圈；ingest/reembed 全走此函式一併受惠。
2. ✅ **後端 startup 建 HNSW 索引無保護**（`db/session.py`）——embedding >2000 維（如 gemini-embedding-001 3072）時 `CREATE INDEX` 炸掉、**後端完全起不來**；`reembed_all()` 自己有 try/except，startup 沒有。**已修**：try/except + warning，與 `reembed_all()` 一致；重啟實測 3072 維資料下正常啟動。
3. ✅ **embedding「儲存」留空 key 會洗掉已存 key**——前端 placeholder 寫「留空＝沿用現有」，但送空字串、後端 `set_embed` 整包覆寫落檔。**已修（純後端）**：`set_embed`/`test_embed` 的 `api_key` 留空時沿用 `embedding.current().api_key`；前端零改動即符合 placeholder 語意。實測：空 key 存檔後 `api_key_tail` 仍為 `…DxOI`、測試連線用已存 key 成功。
4. ✅ **設定頁「立即更新一次」後狀態永遠「尚未執行過」**——`last_run_at` 只有排程迴圈的 `_run_job()` 會寫，手動路徑不寫。**已修**：抽出 `scheduler.mark_run()`，`POST /api/policy/refresh` 成功後呼叫；實測 refresh 後 `GET /api/schedule` 的 `last_run_at`/`last_result` 有值。

**附帶（`greenlet` 已一併處理）**：後端 `greenlet` 加入 `pyproject.toml`（macOS/py3.13 缺，`uv lock` 已含）；`uv.lock` 為 gitignore、靠 pyproject 宣告即可。**仍未處理（記錄用，不擋 demo）**：thinking 型模型（gemini-2.5-flash）會把 `daily_brief` 的 `max_tokens=1024` 吃光導致晨報生成失敗（gemma/flash-lite 正常，demo 用後者即可）；後端 5xx 回應無 CORS header（瀏覽器顯示為 CORS 錯，實為 500）；新聞來源標題偶帶 `**` markdown 星號直接顯示（上游資料即如此）；Gemini 免費層偶發 503，重試即過。

**契約已補記**：`docs/collab/policy.md` §4 已明文 `briefs[].id === 'day-live'`、`type === 'daily'`（前端 `isLiveBrief`/`mergeLiveBriefs` 依賴這兩值）+ §8 變更列。**此為前端唯一未 commit 變更，待 owner commit。**

**環境現況（測畢保留，可直接 demo）**：`imarine-pg` 容器運行中、rag-agent :8100 運行中（Gemini 設定）、dev server :5173 運行中；排程已還原 enabled=false。要關：`pkill -f uvicorn`、`docker stop imarine-pg`。

（以下為協作者 PR #2 帶入的紀錄）

原「最後更新」：2026-07-12 **報告匯出（Markdown 下載 + 列印/存 PDF）+ 每日排程（可設定每天抓取時間），詳見「## 0-4」。同日稍早：②③ 雲端 API 設定 + 報告頁嫁接（設定頁加「模型 id」欄可接任意雲端端點、地端/雲端切換真切後端；報告頁實測用設定頁配置的模型），詳見「## 0-2」。先前同日：政策收件匣「每日晨報」改由新聞知識庫 live 生成 + 晨報可自由提問/建議 chips + 更新新聞按鈕（跨前後端，尚未 commit）**——後端新增 `ae_news` 知識庫 + 從中 LLM 生成 `DailyBrief`（含建議追問）的 `/api/policy/briefs`、`/api/policy/refresh`；前端 policy `snapshot()` 改接 live 晨報（取代 mock 晨報、保留突發/政策範例）+ 晨報卡開放自由提問與建議 chips 走真 `/api/chat` + 收件匣「更新新聞」按鈕。過程中發現並修復 embedding 維度既有問題（bge-m3 1024 vs 欄位 768，已 reembed 遷移）。詳見「## 0. 本輪」。（Alert 頁改版已於 2026-07-08 完結 push，見後）

---

## 0-5. 本輪追加（2026-07-12）測試連線訊息分類（A）+ Embedding 可設定（B）

> 使用者回報「bge-m3、gpt-oss-120b 明明有卻連不上」。診斷：NCHC `/models` 有這些模型，但（1）「測試連線」只打 `/chat/completions`，**測不了 embedding 模型**（bge-m3 是 embedding）；（2）NCHC litellm 有 **429 限流**；（3）錯誤訊息太籠統。且 embedding 模型在 UI **根本無法設定**（model-id 欄只建 chat、改 embedding 下拉不 push 後端）。**尚未 commit。**

- **A：測試連線訊息分類**。後端 `generation/provider.py` 的 `probe()` 加 `_classify_http_error`（429 限流／404 模型不存在／400/422 非 chat 模型／401 金鑰），且成功路徑改 robust（reasoning 型空 content 也算連上，實測 gpt-oss-120b→✓）。前端 `settings/sections/policy.ts` 的 `testBtn` catch 改為**顯示後端分類訊息**（原本吞掉只顯示籠統句）。
- **B：Embedding 可在 UI 設定/測試/reembed**。後端：`indexing/embedding.py` 加 `probe()`（打 `/embeddings` 測試，回 ok/message/dim）；`api/routes/settings.py` 加 `POST /api/settings/embed/test` 與 `POST /api/settings/reembed`（接回 `reembed_all`，補上先前「reembed 未接 UI」缺口）。前端：`settings/backend.ts` 加 `testEmbedding/pushEmbedConfig/reembedAll`；`settings/sections/policy.ts` 新增 **`embeddingGroup`**（後端 api/local 切換 + 模型 id + URL/KEY + 測試連線 + 儲存 + 重新索引全部），註冊於 `policySection.groups`（模型管理下方）。實測：embeddinggemma-300m→維度 768、bge-m3→429、gpt-oss-120b(embed)→「非 embedding 模型」。
- **注意**：模型管理「系統預設模型」內原本的 embedding 下拉仍在（未 push 後端、屬 legacy），新的 `Embedding 模型` group 才是真正生效處；日後可移除舊下拉。換 embedding 模型後務必按「重新索引全部」（維度可能變）。tsc 0 + build ok。

---

## 0-4. 本輪追加（2026-07-12）報告匯出 + 每日排程

> 政策報告缺口盤點後，使用者選「先報告匯出、再每日排程（要能設定每天抓取時間）」。**尚未 commit。**

- **報告匯出（前端 `src/screens/policy/index.ts`，經核准）**：`renderReportCard` 加兩顆按鈕「下載 Markdown」「列印 / 存 PDF」（只在 live 產出的報告卡出現，mock 範例卡不受影響）。新增 `reportToMarkdown()`（章節 html→純文字：cite span→`[n]`、`<br>`→換行、去標籤、解 entity + 參考來源清單）、`downloadReport()`（Blob 下載 `.md`）、`printReport()`（開新視窗載入報告 html + 列印樣式 → 瀏覽器列印/另存 PDF，**零依賴**）。tsc 0 + build ok。
- **每日排程（後端，零依賴）**：`src/rag_agent/scheduler.py`——**不引 APScheduler**，改 asyncio 迴圈每 30s 檢查，到 `data/schedule_config.json` 的 `HH:MM`（伺服器本地時間）且當日未執行時，跑 `run_news_ingest + build_daily_brief`（當日只跑一次；config 變更即時生效）。`api/routes/schedule.py`：`GET/POST /api/schedule`。`main.py` startup 啟動迴圈。實測：config get/set + 迴圈啟動 + 直接呼叫 `_run_job()` 成功抓新聞+重生成。**demo 環境目前 enabled=False（clean）。**
- **每日排程（前端，經核准）**：`settings/backend.ts` 加 `getSchedule/setSchedule/runNewsRefresh`；`settings/sections/policy.ts` 於 `policySection.groups` 加 `scheduleGroup()`——「新聞自動更新」設定區：啟用/停用 segmented + **每日時間 `<input type="time">`** + 「立即更新一次」按鈕 + 狀態（上次/下次執行）。位置：系統設定 → 政策報告 → 模型管理下方。tsc 0 + build ok。
- **注意**：排程用**伺服器本地時間**（機器在台灣即台北時間，未引 tz 依賴）；伺服器需常駐才會觸發（uvicorn 在跑）；錯過當日時間不補跑。

---

## 0-3. 本輪追加（2026-07-12）④ 報告情境測試 + 修復「報告很爛」

> 使用者回報「報告產出有點爛」。**根因＝知識庫幾乎是空的**：這輪全新 DB 只 ingest 了新聞（`ae_news` 211 chunks），其他 7 個來源（商港法、RSS、替代能源 5 庫）全 0 chunks，報告只能靠新聞標題硬湊。**（後端工作，前端無改動。）**

- **修復**：跑 `POST /api/ingest/run`（完整 ingestion）→ 8 文件、278 chunks 新增並 embed（向量欄位已是 1024，bge-m3 正常寫入）。KB 現況 ~489 chunks：ae_news 211、商港法 76、ae_taiwan 74、ae_intl 65、RSS 24、ae_fuel 23、ae_education 10、ae_overview 6。**報告覆蓋率 41.7% → 58~100%**，內容紮實有據（IMO NZF/GFI/Tier 收費/氣候法/陽明·萬海 LNG…）。
- **④ 情境測試 harness**（`iMarine-rag-backend`）：`scripts/eval_report.py`（6 代表性情境：綠色甲醇/IMO NZF/商港法/岸電/新聞彙整/船員培訓；量測 citation 覆蓋率、空章節、期望來源類型、單一來源撐整段；印表 + 存 markdown；stdout 強制 UTF-8 避開 Windows cp950 崩潰）+ `docs/report-scenarios.md`（情境目錄 + 驗收標準）。基準：**6/6 通過硬性標準**（覆蓋率門檻 + 無空章節 + 期望來源類型；商港法情境確實命中 regulation）。
- **剩餘品質信號（軟性）**：部分章節「單一來源撐整段」（國際案例/政策法源/建議事項）；seafarer_training 最弱（58%，教育庫僅 10 chunks）。改進方向：檢索/prompt 層強化各章節證據多樣性、豐富薄的來源。
- **維運提醒**：**新環境務必先跑一次 `POST /api/ingest/run`**，否則報告會因空庫而爛。資料存於 pgvector 具名 volume `imarine_pg_data`，容器重啟不遺失。
- **新增兩個報告模版（取自真實航港報告結構）**：`templates.py` 加 `maritime_policy_research`（航港政策研究報告六段，仿交通部運研所《國際海運減碳趨勢與貨櫃運輸因應探討》：前言／國際規範趨勢／國際港口案例／我國現況／課題與挑戰／結論建議）與 `maritime_intel_brief`（國際海事動態分析五段，仿航港局《國際海事公約及趨勢動態掌握與因應分析》）。前端下拉自動多兩個選項（`/api/report/templates`）。**六段模版會被 1024 token 截斷末段** → `api/routes/report.py` 的 `max_new_tokens` 預設 1024→**2048**。實測：政策研究報告六段全滿、覆蓋 100%。demo 首選此模版（見 `DEMO.md`）。過去報告亦可上傳進知識庫當檢索參考（設定頁知識庫管理）。

---

## 0-2. 本輪追加（2026-07-12）②③ 雲端 API 設定 + 報告頁嫁接

> 使用者原始清單 ②③。盤點後：後端 settings 端點、前端 `backend.ts` client、設定頁 Setup modal（測試/儲存/`syncLlmToBackend`→`POST /api/settings/llm`）**都已在**；`/api/report` 早已用 `provider.current()`（.env 預設即 NCHC 雲端 gemma-4-31B-it）。**③ 基本已成立**，本輪補齊 ② 的兩個縫。**尚未 commit。**

- **縫 1：Setup modal 無「模型 id」輸入** → 接任意雲端端點（如 NCHC）時，測試連線用 placeholder 假模型會失敗、能選的也是假 id。**已修**（`src/screens/settings/sections/policy.ts`）：`pmodalHtml` 加 `#pm-model` 欄；`openProv` 帶入/重置；`testBtn` 雲端改用該欄真實模型測試、有填則設為唯一 chat 模型；`saveBtn` 儲存後自動把該 chat 模型設為系統預設推理模型，確保 `syncLlmToBackend` push 的是它。
- **縫 2：「地端/雲端」segmented 只顯示、不真切後端**（且預設 Ollama `connected:true` 但未必有跑）。**已修**：新增 `export applyLlmMode(mode)`——地端＝已連線免金鑰供應商（**push 前先 `listOllamaModels` 探測可達性**，不通則不動後端）、雲端＝已連線需金鑰供應商；push 其 chat 模型到後端並設為推理預設，回 `{ok,message}`。設定頁 `llmGroup` toggle（改 `custom(el,ctx)` 用 `ctx.toast`）與 **政策頁標題列 toggle**（`src/screens/policy/index.ts` import `applyLlmMode`）都改為：樂觀切視覺 → `applyLlmMode` → 成功寫 `policy.llmMode`+toast、失敗還原視覺+toast（後端維持原設定）。
- **驗證**：tsc 0 + build ok。後端端到端實測：`POST /api/settings/llm`（provider=測試雲端-NCHC）→ `GET /api/settings` 反映 → **`POST /api/report` 回 provider=測試雲端-NCHC、model=gemma-4-31B-it、4 章節**，證明報告用設定頁配置的模型。測後已還原 config 並移除 stray `data/llm_config.json`。
- **注意/待辦**：地端模式需真的有跑 Ollama 才切得過去（使用者用 NCHC 雲端、不跑地端，屬預期）；瀏覽器視覺確認未做（無 playwright）——demo 前在設定頁「政策報告 · 模型管理」用「自訂供應商」填 NCHC URL/KEY/模型 id 測試連線→儲存，再回政策頁產報告確認走該模型。

---

## 0. 本輪（2026-07-12）政策晨報 live 生成 + 新聞知識庫

> 使用者需求：抓 iMarine 替代能源新聞當知識庫，並讓 policy 收件匣的情報卡「像範例那樣」從知識庫 live 生成（而非只是外部連結清單）。**方向經一次修正**：先做的「收件匣尾端可點外部連結新聞區」被使用者判定方向錯誤（那把新聞當終點清單，非當生成原料），**已整段撤除**；改為對齊 spec §4.7 的做法——新聞進 KB → AI 生成情報卡。本輪先做 **daily（每日晨報）** 一類 live。**跨前後端，尚未 commit。**

- **新聞資料源（去風險）**：新聞頁 `#/alternativeenergy/news` 背後真實 API 為 `GET https://imarine.motcmpb.gov.tw/api/news`（JSON 陣列、每日更新、實測 205→206 筆）。**不需 Playwright**。連結型聚合，**無全文內文**（正文都在外站），故 KB chunk 僅索引「標題＋來源＋分類＋關鍵字」。
- **後端（`iMarine-rag-backend`，已本地驗證）**：
  - 新聞當 KB：`ingestion/news_imarine.py`（`AltEnergyNewsConnector`，source_id=`ae_news`，type=`alt_energy`）+ `governance/chunking.py` 的 `AltEnergyNewsChunker`（chunk_id=`AE-NEWS-{id}`）+ `base.py` registry + `pipeline.py` PIPELINE。
  - 晨報生成：`generation/daily_brief.py`——抓最新 12 則 `ae_news` → LLM（NCHC 雲端 gemma-4-31B-it）綜合成 `DailyBrief`（4-6 條重點各附新聞來源引用 + watch），快取 `data/daily_brief.json`。sources 重新編號對齊 item.cite。
  - 端點：`api/routes/policy.py` = `GET /api/policy/briefs`（讀快取）、`POST /api/policy/refresh`（重抓新聞→重生成；embed best-effort 容錯，失敗回 `chunks_embedded=-1` 不 500）。`pipeline.run_news_ingest()` 只抓新聞。
  - **修復既有 embedding 維度問題**：`.env` 用 bge-m3（1024 維）但 `chunks.embedding` 欄位是 `Vector(768)`，且 `reembed_all()` 從沒被任何端點呼叫過 → API embedding 一直寫不進。**已跑 `reembed_all()` 遷移**：欄位改 `vector(1024)`、206 chunks 全 embed、HNSW 重建。實測「荷姆茲海峽」dense 檢索命中 `ae_news`。**注意：全新 DB 仍是 768，換 embedding 模型後需再跑一次 reembed_all（目前無 UI/端點觸發，是缺口）。**
- **前端（本 repo，經使用者核准後改；tsc 0 + build ok）**：
  - `src/data/types.ts`：`DataExchange.policy` 加 `refreshNews?()`。
  - `src/data/exchange/policy.ts`：`snapshot()` 改為先 `GET /api/policy/briefs` 取 live 晨報，`mergeLiveBriefs()` 讓 **live 晨報置頂、取代 mock 的 daily 類、保留突發/政策 mock 範例**；後端不在 fallback 全 mock。新增 `refreshNews()` → `POST /api/policy/refresh`。
  - `src/screens/policy/index.ts`：`refreshNews()` 函式（重抓→更新 briefs→若在晨報則切到新晨報）+ `mount()` 綁 `#newsBtn`。`policy.html` 收件匣 cap 加「更新新聞」按鈕（重用 `.simbtn`）。
  - **晨報可提問**：`sendFree()` 與 chip 點擊在 live 晨報（`isLiveBrief`，id=`day-live`）時走真 `/api/chat`（原本只有綜合對話 live，其餘回罐頭訊息）；`askLive()` 一般化——記住提問當下的卡（回應期間被切走則放棄）、晨報模式把答案證據以 `renderLiveAnswerSources()` 渲染到右欄（cite 對齊 provider 的 1..k 編號），global 模式維持原 `globalUnion` 映射。晨報的 `qa` 建議問題由後端 `daily_brief.py` 生成（`a` 留空，chip 點擊走 live）。實測 `/api/chat` 對新聞問題 grounded 回答、citation 覆蓋 87.5%、evidence 含 `ae_news`。
- **驗證**：後端晨報生成品質良好（荷姆茲/陽明運價/UAE 原油等 5 條、grounding 100%）、`/api/policy/briefs`+`/refresh` 實測通過、reembed 後 dense 檢索命中新聞；前端 tsc 0 + build ok。**瀏覽器視覺確認未做**（無 playwright）——demo 前在 `npm run dev`（:5173，後端 :8100）人工看：收件匣頂部 live 晨報卡（items+watch+右欄新聞來源引用）+「更新新聞」按鈕。
- **下一階段待辦**：incident/policy 兩類也改 live 生成（目前仍 mock）；② 設定頁雲端 API 連線 + ③ 報告頁走真 `/api/report`；④ 輔助報告情境測試；把 `reembed_all` 接到設定頁/端點；新聞每日定時排程（目前手動按鈕）。

**（以下為前一輪「協作流程優化」，已完結並 push origin main，敘述保留於下方）**

最後更新：2026-07-12 **「協作流程優化」輪：SDD 7 tasks 全數完成，分支 `collab-workflow`（自 main `39efe40`），尚未合併回 main、尚未 push。落地方案 B 四件套，解四痛點（契約沒對齊、PR 品質參差、整合測試費工、資訊銜接斷層）——dispatch/epidemic/alert 三頁 + policy 續接，各自獨立後端 repo、不同協作者。(1) `scripts/verify/` 雙層驗收：`lib.mjs` 純函式（`checkFields`/`summarize`/`formatResults`）+ `contract.mjs` 契約 smoke runner + `live.mjs` Playwright live runner，每模組一對 `contracts/<模組>.mjs`/`live/<模組>.mjs`（policy 實作、dispatch/epidemic/alert 骨架回「契約待定」）；(2) `.github/workflows/ci.yml`（PR + push main 三綠燈 tsc/vitest/build 把關）+ `.github/pull_request_template.md`；(3) `docs/collab/` 整合卡六檔（`README.md` port/env 分配總表 8100/8200/8300/8400 + `_template.md` + `policy.md` 填實 + `dispatch`/`epidemic`/`alert.md` 三骨架）；(4) `CONTRIBUTING.md` 協作單一入口（八節，含 §3 改動範圍白名單）+ `README.md`/`CLAUDE.md`/`.env.example` 接線（三後端變數 `VITE_DISPATCH_API`/`VITE_EPIDEMIC_API`/`VITE_ALERT_API`）。`package.json` 加三 script：`check`/`verify:contract`/`verify:live`。**Task 7（本輪）全站驗收**：三綠燈 tsc 0 / vitest 29 檔 143 tests 全綠（新增 verify-lib 11 tests）/ build ok；verify 全矩陣逐一實跑——dispatch/epidemic/alert 三模組 `verify:contract` 皆「契約待定」exit=2（設計內狀態）；policy `verify:contract`（本機 rag-agent `:8100` 確認未啟動）友善連線失敗 0 PASS/2 FAIL exit=1；alert `verify:live` 契約待定 exit=2、不起 dev server；policy `verify:live` 停在 mock fallback（綜合對話總覽卡文案 FAIL、右欄來源計數 `srcCount=24` PASS、零 pageerror PASS）exit=1；跑畢 `:5320` 確認 port clean。**誠實分野**：policy live 成功路徑（rag-agent 起後全 PASS/exit=0）本機未驗，僅驗過失敗路徑，如實記錄。文件互鏈全檢（CONTRIBUTING/PR 模板 `verify:` 引用、`docs/collab/` 六檔、`scripts/verify/` 全檔）皆存在無缺。新協作者自查演練（以「dispatch 後端協作者第一天」視角只讀 CONTRIBUTING.md + `docs/collab/dispatch.md`）：clone→環境建置（§2）→改動範圍（§3）→契約寫哪（整合卡 §4 + `contracts/dispatch.mjs`）→PR 前跑什麼（§6）→會被怎麼驗（§8）六步全數有明確指示，**無斷點**。詳細逐項證據見 `.superpowers/sdd/task-7-report.md`（scratch，未進版控）。spec：`docs/superpowers/specs/2026-07-12-collab-workflow-design.md`；plan：`docs/superpowers/plans/2026-07-12-collab-workflow.md`。**待使用者**：(1) 決定 finishing 時機（merge/push 到 main）；(2) push 後看 GitHub Actions「CI」首跑綠；(3) GitHub 設 branch protection required status check（workflow 名 `CI`、job 名 `check`，UI 上通常顯示為 `CI / check`）；(4) 之後本機或 CI 環境可起 rag-agent 時，補驗 `verify:contract -- policy`/`verify:live -- policy` 的成功路徑（全 PASS/exit=0），本輪只驗過失敗路徑；(5) 通知協作者 CONTRIBUTING.md 上線，dispatch/epidemic/alert 可以開始接後端。**殘留（非缺陷）**：dispatch/epidemic/alert 三模組契約「待定」為方案設計內狀態——骨架先行，後端負責人第一個 live PR 才填實整合卡 §4 + `scripts/verify/contracts/<模組>.mjs`，不是本輪遺漏。

**（以下為前一輪「集中式背景影片層」，已完結並 push origin main，敘述保留於下方）**

**「集中式背景影片層」輪：SDD 5 code tasks + Task 6 全站驗收完成，分支 `page-backdrop-videos`（自 main `7410bfd`）→ 使用者選 finishing「合併回 main」：已 fast-forward 合併（`156c894`，7 commits）+ 背景影片壓低存在感微調（`#backdrop` 亮度 .75 + 透明度 .8）+ **push origin main**、分支已刪。落地：`src/shell/backdrop.ts`（`resolveBackdrop` 純函式 + `initBackdrop` 生命週期）集中管理單一 `<video id="backdrop">`＋`#backdrop-scrim`，`main.ts` 的 `onChange` 加一行 `backdrop.setScreen(def)` 接線；hero 收編（拔除私有 `<video>`/scrim，改吃集中層，兩段式 cover/ov 不受影響）；六頁（carbon/policy/dispatch/epidemic/alert/agent）`registry.ts` 掛 `bg`/`poster`；twin/settings 無 `bg`、照舊退回 `#harbor` 點雲；scrim 強度純 CSS 三態（cover 輕/ov 略暗/doc 較重，沿用既有 `data-mode`）；poster 抽幀腳本 `scripts/backdrop-poster.mjs` + README「頁面背景影片」章節記錄加頁流程。三綠燈：tsc 0 / vitest 28 檔 132 tests（含新增 backdrop 4 tests）/ build ok。Task 6 用獨立 Playwright（`playwright@1.61.1`）headless Chromium + 自起 dev server `:5301`（跑畢已清、未動使用者既有 port/`.env`）跑 25 項斷言**全 PASS**：六頁 backdrop 顯示+src 正確、twin/settings 無 backdrop 且 `#harbor` 照舊、hero 兩段式（`.herobg` 已全站不存在、`currentSrc` 全程指向 hero-bg、cover⇄ov 切換正確）、reduced-motion（`matchMedia` 機制直接生效，不需 localStorage fallback）、9 頁鍵盤 sweep 版面非空、**console 全程零 pageerror**（僅有預期中的後端未起 `ERR_CONNECTION_REFUSED` console.error，非 backdrop 回歸）。截圖 9 張存 scratch 供人眼複核。殘留待後續：(a) policy/dispatch/epidemic/alert 四頁背景影片位元組完全相同（同一份 placeholder 素材，四頁觀感目前一樣，待補真實素材，換素材免改程式碼）；(b) hero 兩處過時標頭註解 + 一個死 `sectionEl` 變數留著（CORE RULE 不擅自清，交使用者決定）；(c) 原始高位元率來源影片備份於 gitignored `backdrop-src-orig/`。**本 session 後續**：(1) 背景影片降亮度 .75 + 透明度 .8（`tokens.css` `#backdrop`）已 commit 並隨本輪 push；(2) carbon live 實測 OK——起 PoC chain(:8545)+api(:8000)，因舊 `backend/ledger.db`（118 筆）對應的記憶體鏈已隨程序關閉消失、與新部署合約不一致，故備份後重置 DB + `POST /pipeline` 重 seed 108 筆真發到新鏈（`/verify/0` match=true 一致），發行/掛單/購買寫入正常，測畢三服務（chain/api/dev）全關；舊 DB 備份在 scratchpad（非版控）。carbon live 啟動序仍為 PoC repo：`make chain`→`make deploy`→（`make data` 已有 108 筆 requests）→`make api`，鏈換新則需重置 `backend/ledger.db` 配新鏈。

**（以下為前一輪「競賽簡報腳本 + 9 支系統展示影片自動化錄製」，已完結並 push origin main，敘述保留於下方）**

**「競賽簡報腳本 + 9 支系統展示影片自動化錄製」輪：SDD 10 tasks 全數完成（Task 1-2 基礎建設逐 task review clean/Approved，Task 3-10 錄影階段由主控直驅+抽幀讀圖驗證），分支 `ppt-demo-recording`（自 main `d64edc1`），三綠燈 tsc 0 / vitest 27 檔 128 tests 全綠 / build ok。產出：簡報腳本 `docs/presentation/簡報腳本.md`（段落 0-9 講稿/cue 表/分鏡/評分項對照/播放備援/重錄索引）+ 9 支 demo 影片 `demo-videos/*.mp4`（gitignored，可再生成）+ 錄影管線 `scripts/demo/`（ffmpeg 純函式 TDD + recorder + 合成游標 + 9 支 scenario）。** 影片：hero-cover 13.8s / hero-overview 14.5s / carbon 42.7s（**live 真上鏈**）/ policy 26.3s / twin 31.9s（**live WebGL**）/ dispatch 24.1s / epidemic 30.5s / alert 23.4s / agent-finale 49.3s（**live Gemini**）。錄製隔離（獨立 dev server :5288 + headed Chromium 真 GPU、未動使用者 `.env`/`:5173`/`:5174`/`:8000`/`:8545`）；每支抽幀讀圖確認版面/payoff/游標/無 pageerror。可重錄性：carbon 雙錄皆成功（唯一時間戳 IMO 防撞）。最終 whole-branch review（opus, `d64edc1`..`c749ed8` = Ready to merge: Yes，零 Critical/Important，1 Minor twin boundingBox null 已修 `c749ed8`）。**finishing：使用者決定「先這樣就好」（其他頁面功能仍在開發中、暫停不再改），重點是保留錄影管線供日後重錄——已 fast-forward 合併回 main + push origin main、README 新增「簡報 Demo 影片錄製」章節記錄工作流程。** **工作流程（務必記得）：任一頁面介面／後端定案後，`npm run demo:record -- <scenario>` 一行重錄該段即可（九支名單/依賴/重錄索引見 README「簡報 Demo 影片錄製」+ 簡報腳本 §13）；mock 頁上線後重錄會自動轉 LIVE chip。** 待使用者：(1) 有空人眼看一輪 9 支影片動態品質（游標順暢/切換震撼/pacing——抽幀無法完全判斷）、想調節奏就改 scenario sleep 重錄；(2) 前輪遺留未清：協作者 PR #1 GitHub 關閉、`index.html` hint bar 過時。（前一輪「數位員工入口 + settings 分區」已完結並 push origin main，敘述保留於下方。）

---

## 1. 目前狀態

**協作流程優化（本輪）：SDD 7 tasks 全數完成，分支 `collab-workflow`（自 main `39efe40`），尚未合併回 main、尚未 push。**
- 動機：優化協作流程，解四痛點——契約沒對齊（前後端各寫各的，接上才發現形狀不合）、PR 品質參差（協作者不熟本 repo 慣例）、整合測試費工（每次要人工起後端+手動點頁面驗）、資訊銜接斷層（後端 repo/port/契約資訊分散無單一入口）。背景：dispatch/epidemic/alert 三頁 + policy 續接，各自獨立後端 repo、不同協作者，需要一套可重複的協作骨架。決策紀錄見 `docs/superpowers/specs/2026-07-12-collab-workflow-design.md`。
- **落地方案 B 四件套**：
  1. **雙層驗收腳本**（`scripts/verify/`）：`lib.mjs` 純函式（`checkFields(obj, fields)` 欄位形狀檢查／`summarize(results)`／`formatResults(results)`，TDD `tests/verify-lib.test.ts` 11 tests）+ `contract.mjs`（契約 smoke runner，直打後端 API 驗形狀，不依賴瀏覽器）+ `live.mjs`（Playwright headless 起 dev server 驗頁面真渲染 + chip 轉 LIVE + 零 pageerror）；每模組一對斷言檔 `scripts/verify/contracts/<模組>.mjs` + `scripts/verify/live/<模組>.mjs`——policy 兩檔皆已實作（真打 `/api/sources`/`/api/report/templates`、真驗頁面文案+來源計數），dispatch/epidemic/alert 六檔皆為骨架，統一回傳 `{pending:true, reason}` 使 runner 印「契約待定」+ exit=2（設計內狀態，非未完工遺漏）。
  2. **CI 把關**：`.github/workflows/ci.yml`（`pull_request`/`push` 觸發 main，job `check`：`actions/checkout` + `setup-node@v4`（Node 22）+ `npm ci` + `tsc --noEmit` + `npm run test` + `npm run build`，三綠燈跑在 PR 頁面自動可見）+ `.github/pull_request_template.md`（協作者自查清單：模組/改了什麼/§3 範圍自查/契約變更/測試證據/截圖）。
  3. **整合卡**（`docs/collab/`）六檔：`README.md`（port/env 分配總表，唯一權威——carbon 8000+8545/policy 8100/dispatch 8200/epidemic 8300/alert 8400，+ 維護者驗 PR 六步流程）、`_template.md`（8 節模板：基本資訊/起服務/env 變數/API 契約/前端接線/驗收/demo 影片/變更紀錄）、`policy.md`（依現有 rag-agent 整合填實）、`dispatch.md`/`epidemic.md`/`alert.md`（三骨架，§4 API 契約待後端負責人第一個 live PR 填實）。
  4. **CONTRIBUTING.md**（協作單一入口，八節）：§1 專案脈絡 30 秒、§2 環境建置（Node 22/`npm i`/`.env.example`/`npm run dev`/起自己後端見整合卡 §2）、**§3 改動範圍白名單**（准動：provider/自己 screen/自己 settings 分區/自己型別區塊/自己 mock json/自己整合卡/自己 verify 契約檔/自己測試；禁改：`src/shell`/`src/ui`/`main.ts`/`index.html`/其他模組檔案/`package.json`/`.github/`/`scripts/demo/`/`CLAUDE.md`/`HANDOFF.md`——軟約束，CI 不硬擋，PR 模板自查 + review 把關）、§4 資料交換層規則（後端 API 為準、live 失敗必退 mock 硬規則、chip 如實顯示）、§5 設計規範連結（不重複根 README）、§6 提交流程（branch 命名 + 發 PR 前自查序列 `check`→`verify:contract`→`verify:live`、契約變更三件套）、§7 給 AI 助手的指引、§8 維護者驗 PR 流程（協作者也看得到自己會被怎麼驗）。接線：根 README 新增協作者指南章節導引至 CONTRIBUTING、`CLAUDE.md` 補一句指向 CONTRIBUTING（協作情境不適用 CLAUDE.md 個人規則）、`.env.example` 補三後端變數 `VITE_DISPATCH_API`/`VITE_EPIDEMIC_API`/`VITE_ALERT_API`（對應 8200/8300/8400，`VITE_POLICY_API` 既有沿用）。`package.json` 加三 script：`check`（`tsc --noEmit && vitest run && vite build`）、`verify:contract`（`node scripts/verify/contract.mjs`）、`verify:live`（`node scripts/verify/live.mjs`）。
- **SDD 7 tasks（各自逐 task 獨立完成，commit 對照）**：(1) `4e21b0e` verify 共用 lib 純函式 TDD；(2) `8fcd194` 契約 smoke runner + policy 契約檔實作 + dispatch/epidemic/alert 骨架；(3) `a2c7edd` Playwright live 驗收 runner + policy 斷言檔實作 + 三骨架；(4) `3312b43` CI 三綠燈把關 + PR 自查模板 + `npm run check`；(5) `037481e` 整合卡五件（分配總表/模板/policy 填實 + dispatch/epidemic/alert 骨架）；(6) `7cf9681` CONTRIBUTING 協作單一入口 + README/CLAUDE.md 導引 + `.env.example` 預留三後端變數；(7) 本 task：全站驗收 + HANDOFF 收尾。spec/plan commit `f90500c`。全 commit author=charles、無 Claude/Anthropic 署名。
- **驗收（Task 7，本輪，誠實分野）**：三綠燈——`tsc --noEmit` 0、`vitest run` 29 檔 143 tests 全綠（基線 28 檔 132 + 本輪新增 verify-lib 11 tests）、`build` 成功（chunk size 警告為既有事實，非本輪回歸）。**verify 全矩陣逐一實跑**（非假設，逐條記錄實際輸出與退出碼）：`for m in dispatch epidemic alert; do npm run verify:contract -- $m; done` 三模組皆輸出「[<模組>] 契約待定：後端 API 契約尚未定案（見 `docs/collab/<模組>.md` §4）」+ exit=2；`npm run verify:contract -- policy`（跑前 `lsof -ti tcp:8100` 確認本機 rag-agent 未啟動）輸出 `GET /api/sources`/`GET /api/report/templates` 兩項皆 FAIL「後端未啟動（`http://127.0.0.1:8100` 連線被拒）——照 `docs/collab/policy.md` §2 起服務後重試」、0 PASS/2 FAIL、exit=1；`npm run verify:live -- alert` 輸出「契約待定」+ exit=2、未起 dev server；`npm run verify:live -- policy` 停在 mock fallback——「綜合對話總覽卡為 live 文案」FAIL（實際文案含「已就緒」判定為 mock fallback）、「右欄來源計數 > 0」PASS（`srcCount=24`）、「全程零 pageerror」PASS，2 PASS/1 FAIL、exit=1，截圖存 `/var/folders/.../imarine-verify-live-policy.png`；跑畢 `sleep 1; lsof -ti tcp:5320` 空、port clean。**誠實分野**：policy 的 `verify:contract`/`verify:live` 本輪只驗證了「後端不在」的失敗路徑（friendly 錯誤訊息 + 正確 exit code），rag-agent 未啟動故成功路徑（全 PASS + exit=0）本機未實測，如實記錄、不假裝跑過。文件互鏈全檢：`grep -o "verify:[a-z]*" CONTRIBUTING.md .github/pull_request_template.md` 兩檔皆命中 `verify:contract`/`verify:live`；`node -e` 驗證 `package.json` 三 script 皆存在；`docs/collab/{README,_template,policy,dispatch,epidemic,alert}.md` 六檔皆存在；`scripts/verify/{lib,contract,live}.mjs` + `scripts/verify/contracts/*.mjs`（4 檔）+ `scripts/verify/live/*.mjs`（4 檔）皆存在，無指向不存在檔案的引用。**新協作者自查演練**（spec 驗收標準 6，以「dispatch 後端協作者第一天」視角只讀 CONTRIBUTING.md + `docs/collab/dispatch.md`）：clone→環境建置（§2：Node 22/`npm i`/`.env.example`/`npm run dev` :5173/起自己後端見整合卡 §2，皆有明確指令）→改動範圍（§3 白名單逐條列出，`dispatch.md` 亦重申 provider/自己 screen 路徑）→契約寫哪裡（整合卡 §4「契約待定——後端定案的第一個 live PR 填實本節 + `scripts/verify/contracts/dispatch.mjs`」，與 CONTRIBUTING §6 契約變更三件套一致）→發 PR 前跑什麼（§6 序列 `npm run check`→`verify:contract -- dispatch`→`verify:live -- dispatch`）→會被怎麼驗（§8 六步，與 `docs/collab/README.md` 底部維護者流程重複確認一致）——**六步全數有明確指示，無斷點**，不需回頭補文件。完整逐項證據見 `.superpowers/sdd/task-7-report.md`（scratch，未進版控）。
- **殘留（誠實記錄，設計內狀態非缺陷）**：dispatch/epidemic/alert 三模組的 `scripts/verify/contracts|live/<模組>.mjs` 與 `docs/collab/<模組>.md` §4 皆為「待定」骨架——這是方案刻意設計的骨架先行策略，等後端負責人真的加入協作、契約定案的第一個 live PR 才填實，不是本輪未完成的工作。
- spec：`docs/superpowers/specs/2026-07-12-collab-workflow-design.md`；plan：`docs/superpowers/plans/2026-07-12-collab-workflow.md`；逐 task 報告 `.superpowers/sdd/task-7-report.md`（scratch，未進版控，注意此路徑被多輪重複使用）。
- **待使用者（手動步驟）**：(1) 決定 finishing 時機——分支 `collab-workflow` 尚未合併回 main、尚未 push；(2) push 後至 GitHub Actions 確認「CI」workflow 首次跑出全綠；(3) 於 GitHub repo 設定 branch protection，required status check 勾選本 workflow 的 job（workflow 名 `CI`、job 名 `check`，GitHub UI 通常顯示為 `CI / check`）；(4) 之後本機或有 rag-agent 可用的環境時，補驗 `npm run verify:contract -- policy`/`npm run verify:live -- policy` 的成功路徑（期望全 PASS、exit=0），本輪僅驗過失敗路徑；(5) 通知 dispatch/epidemic/alert 的協作者 CONTRIBUTING.md 已上線，可以開始 clone 接後端。

**（以下為前一輪「集中式背景影片層」，已完結並 push origin main，敘述保留於下方）**

**集中式背景影片層（本輪）：SDD 5 code tasks + Task 6 全站驗收完成，分支 `page-backdrop-videos`（自 main `7410bfd`），尚未合併回 main、尚未 push。**
- 動機：hero 既有的「封面波浪影片 + gradient scrim」證明影片底圖的觀感可行，本輪把這個能力抽成全站共用的集中層，讓其餘六大功能頁（twin 原生 WebGL 除外）都能掛上各自的 seamless loop 影片，強化 PPT 簡報/demo 現場的視覺一致性；同時把 hero 私有的 `<video>`/scrim 收編進集中層，避免兩套背景邏輯並存。決策紀錄見 `docs/superpowers/specs/2026-07-12-page-backdrop-videos-design.md`。
- **核心抽象**：`src/shell/backdrop.ts` 的 `resolveBackdrop(def, reduced)` 純函式，由 `ScreenDef.bg`/`poster` + reduced-motion 旗標推導出 `{visible, src, poster, play}` 四欄狀態；`initBackdrop(video)` 消費該狀態管理單一 `<video id="backdrop">` 的 `src`/`poster`/播放生命週期（含 `visibilitychange` 分頁隱藏暫停/回前景恢復），回傳 `Backdrop.setScreen(def)` 單一介面；`main.ts` 只在既有 `onChange` callback 內加一行 `backdrop.setScreen(def)`，不碰 `router.ts`、不擾動既有 `show`/`applyMode` 時序。scrim 強度純 CSS：`body[data-bg="on"][data-mode="cover"|"ov"|"doc"] #backdrop-scrim` 三階（cover 最輕、ov 略暗、doc 最重，沿用既有 `data-mode` 語意，本模組不碰 scrim 樣式）。
- **成果檔案**：新增 `src/shell/backdrop.ts` + `tests/backdrop.test.ts`（4 tests）+ `scripts/backdrop-poster.mjs`（ffmpeg 抽 reduced-motion 靜態幀，guard 缺 mp4 非零退出）；`index.html`（插 `<video id="backdrop">` + `<div id="backdrop-scrim">`，移除 hero 舊有版面）、`src/ui/tokens.css`（背景層 z-index/display 規則 + scrim 三態漸層 + 刪 hero 舊 `.herobg`/`.heroscrim`）、`src/main.ts`（`initBackdrop` 初始化 + `onChange` 接線一行）、`src/shell/registry.ts`（`ScreenDef` 加 `bg?`/`poster?` 選填欄位 + 六頁 import 掛值：carbon/policy/dispatch/epidemic/alert/agent；twin/settings 不掛）、`src/screens/hero/{hero.html,index.ts,hero.css}`（拔除私有 `<video>`/scrim DOM 與生命週期，改吃集中層）、README（新增「頁面背景影片（集中式背景層）」章節，記錄加頁四步驟：素材＋poster 抽幀＋registry 接線＋支援頁清單）。
- **SDD 5 code tasks（各自獨立 review）**：(1) `cbd1793` `resolveBackdrop` 純函式 + `ScreenDef.bg/poster` 契約 TDD；(2) `9af93db` 集中背景層 DOM/CSS + `initBackdrop` 生命週期 + `main.ts` 接線（背景層預設 off，驗證無回歸）；(3) `bad140a` hero 收編到集中背景層（拔除私有 video/scrim）；(4) `dfd9ede` poster 抽幀腳本 + README 加頁流程文件；(5) `7e9cc91` 六頁掛上背景影片（carbon/policy/dispatch/epidemic/alert/agent）。逐 task review 見 `.superpowers/sdd/review-{32340a3..cbd1793,cbd1793..9af93db,9af93db..bad140a,bad140a..dfd9ede,dfd9ede..7e9cc91}.diff`。全 commit author=charles、無 Claude/Anthropic 署名。
- **驗收（Task 6，本輪，誠實分野）**：三綠燈——`tsc --noEmit` 0、`vitest run` 28 檔 132 tests 全綠（基線 27 檔 128 + backdrop 4 tests）、`build` 成功（chunk size 警告為既有事實，非本輪回歸）。Runtime 驗證改用**獨立 Playwright（`playwright@1.61.1`，非 CDP 手動腳本）** headless Chromium + 自起 dev server `:5301`（`--strictPort`，跑畢已 kill、`lsof -ti tcp:5301` 確認無殘留、未動使用者既有 `:5173`/`:5174`/`:8000`/`:8100`/`:8545`/`.env`）：25 項斷言**全 PASS**——① 六 bg 頁（carbon/policy/dispatch/epidemic/alert/agent）逐頁 `data-bg="on"`、`#backdrop` `display:block`、`src` 落在對應 `<id>-bg.mp4`（policy/dispatch/epidemic/alert 四頁 URL 不同但底層位元組相同，屬素材現況、非驗收失敗，詳見殘留項）；② twin/settings 兩頁 `data-bg` 缺席、`#backdrop` `display:none`、`#harbor` canvas 照舊存在；③ hero 兩段式——cover 態 `data-mode="cover"`、`#backdrop.currentSrc` 指向 `hero-bg.mp4`、全站 `.herobg` 已不存在（確認收編）；`hero:toggle` → `data-mode="ov"`（`.herobg` 依然不存在）；再切回 → `cover` 還原；④ reduced-motion——獨立 context 設 `reducedMotion:'reduce'`，`matchMedia('(prefers-reduced-motion: reduce)')` 機制直接生效（`prefersReduced()` 本身已同時吃 `frontend.reduceMotion` 設定與系統 media query，本輪不需另外用 localStorage fallback），carbon 頁 `#backdrop.paused===true` 且 `poster` 非空；⑤ 9 頁鍵盤 sweep（hero + `0`-`8`）逐頁 `.screen.active` 存在、`childElementCount>0`、版面非零尺寸；⑥ 全程 `page.on('pageerror')` **零筆**，`console.error` 僅出現預期中的 `ERR_CONNECTION_REFUSED`（carbon `:8000`/policy `rag-agent :8100`/agent Gemini 後端本機未啟動，既有事實，非 backdrop 回歸）。截圖 9 張（hero-cover/hero-ov/carbon/policy/dispatch/epidemic/alert/agent/twin）存 scratch 供人眼複核觀感與 scrim 強度，逐張讀圖確認版面完整、無破圖/全黑異常。完整逐項證據見 `.superpowers/sdd/task-6-report.md`（scratch，未進版控）。
- **殘留待後續（誠實記錄，非本輪缺陷）**：(a) policy/dispatch/epidemic/alert 四頁背景影片為**位元組完全相同**的同一份 placeholder 素材（`backdrop-src-orig/` 內四檔皆 3,258,427 bytes 佐證），四頁觀感目前一樣，待補各自真實素材——換素材只需覆蓋 mp4 + 重跑 `node scripts/backdrop-poster.mjs <id>`，registry 已接好免改程式碼；(b) `src/screens/hero/index.ts` 檔頭與 `hero.css` 第 2 行各留一處**過時註解**（仍描述已移除的 hero 私有 `<video>`/scrim 邏輯）+ `index.ts` 的 `sectionEl` 變數賦值後未再讀取（死變數）——依 CORE RULE 不擅自清，交使用者決定是否於 finishing 一併處理；(c) 原始高位元率來源影片備份於 gitignored `backdrop-src-orig/`（六檔，供之後需要更高畫質或重新壓縮時取用，不進版控）。
- spec：`docs/superpowers/specs/2026-07-12-page-backdrop-videos-design.md`；plan：`docs/superpowers/plans/2026-07-12-page-backdrop-videos.md`（5 code tasks + Task 6 驗收）；逐 task 報告 `.superpowers/sdd/task-{1..6}-report.md`（scratch，未進版控，注意此路徑被多輪重複使用）。
- **待使用者**：(1) 人眼看一輪 9 張截圖，判斷 scrim 強度/可讀性是否需微調（doc 頁如 carbon/policy 目前偏暗，設計上是刻意壓對比，但實際觀感留給人眼定案）；(2) 決定殘留項 (b) 的兩處過時註解/死變數是否於 finishing 時一併清理；(3) 六頁素材陸續到位後，逐頁跑加頁流程換上真實影片。**尚未合併回 main、尚未 push——待使用者決定 finishing 時機。**

**（以下為前一輪「競賽簡報腳本 + 9 支系統展示影片自動化錄製」，已完結並 push origin main，敘述保留於下方）**

**競賽簡報腳本 + 9 支系統展示影片自動化錄製（本輪）：SDD 10 tasks 全數完成，分支 `ppt-demo-recording`（自 main `d64edc1`），尚未合併回 main、尚未 push。**
- 動機：其他頁面後端仍在開發中，先做競賽 PPT 呈現——講「為什麼需要 → 怎麼做 → 系統展示（影片）」，六模組逐一講、最後用數位員工把生態系串起來。不現場 demo，PPT 放影片。決策紀錄見 `docs/superpowers/specs/2026-07-12-ppt-presentation-demo-design.md` §2（8 個問答定案：8-10 分鐘/腳本+影片/敘事/均分/純畫面/現在全錄一版上線後重錄/agent 真 Gemini/Playwright 錄製）。
- **成果檔案**：`scripts/demo/ffmpeg.mjs`（+`.d.mts`，buildConvertArgs 四路徑 speed-ramp + buildStillArgs，TDD `tests/demo-ffmpeg.test.ts` 5 案例）+ `scripts/demo/recorder.mjs`（獨立 :5288 dev server[直跑 node vite 非 npx]+headed Chromium 真 GPU+錄影+ffmpeg 轉 mp4/抽停格+pageerror gate+rmSync raw）+ `scripts/demo/cursor.mjs`（合成游標 overlay+漣漪+easing）+ `scripts/demo/scenarios/{hero-cover,hero-overview,carbon,policy,twin,dispatch,epidemic,alert,agent-finale}.mjs` 九支 + `docs/presentation/簡報腳本.md`；接線改動：`.gitignore`（+`demo-videos/`）、`package.json`（+playwright devDep + `demo:record` script）。**不動 src/ 任何檔**（錄影腳本全在 scripts/demo/，三綠燈不受影響）。
- **SDD 10 tasks**：(1) `59dd8a4` ffmpeg 純函式 TDD（review clean）；(2) `7312bd6` recorder+游標+probe 畫質定案 DSF=2（review Approved，實作者抓 brief 逐字碼兩真缺陷並修：addInitScript 在 documentElement 前執行→MutationObserver 等 <html>、pageerror 在 try 內 exit 跳過 finally→exitCode 旗標）；(3) `572627d` hero 兩支；(4) `9329dff` policy+dispatch；(5) `30d8524` epidemic+alert（Mapbox live 磚）；(6) `f9298c1` twin（live WebGL）；(7) `c97c7fe` carbon（live 上鏈）；(8) `aeac2f4` agent-finale（live Gemini）；(9) `680f7fa` 簡報腳本；(10) 本 task 驗收+HANDOFF。spec/plan commit `203632e`。全 commit author=charles、無 Claude/Anthropic 署名。
- **驗收（Task 10，本輪，誠實分野）**：三綠燈——`tsc --noEmit` 0、`vitest run` 27 檔 128 tests 全綠（基線 26 檔 123 + ffmpeg 5）、`build` 成功。產物清點：9 mp4 + 9 stills（`demo-videos/stills/`，PPT 備援用）、無 take/probe 殘留、`demo-videos/` 已 gitignore（`git check-ignore` 確認）、`.env`/`src/` 零 diff。錄影驗證方式（誠實分野）：主控直驅 recorder 逐支錄，每支以 ffmpeg 抽 3-5 幀讀圖確認「版面完整/payoff 停格正確/合成游標定位/資料源 chip/無 console 錯誤畫面」；**動態品質（游標順暢度、切換震撼感、pacing 這類抽幀無法完全判斷的主觀項）留待使用者人眼看一輪**。可重錄性（spec §9.5）：carbon 雙錄皆成功（39.9s/42.7s，時長差來自鏈上確認延遲；唯一時間戳 IMO 防撞）。
- **live 態實錄（真後端，非模擬）**：carbon 接 PoC :8000/:8545 真上鏈（單筆發行「現場驗證數據」鑄造 SU + 上架掛單，稽核帳本全表 118 筆 payoff，錄製真累增 KPI 108→118）；twin 原生 WebGL 真 GPU（未來推演拖 24hr 時間軸+泊位甘特）；agent-finale 真 Gemini（GEMINI LIVE 全程，六幕：巡檢/跨模組盤點 6 citation/溯源跳頁/祈使掛單互動確認卡/真 place_carbon_order 上鏈「已寫入鏈上」/SUGGEST，改的價 3100 一路流到鏈上＝human-in-the-loop 證明）。policy/dispatch/epidemic/alert 為 mock 態（後端未上線，照現況錄、資料源 chip 顯 MOCK，上線後重錄自動轉 LIVE——重錄索引見簡報腳本 §13）。
- **錄影階段實測踩坑定稿（plan Task 6/7/8 預期的「探明再定稿」）**：(a) twin 回放預設暫停（timeline.ts playing=false）→ scenario 明確點 #play；(b) carbon 三坑——plan 假設的頂層掛單/購買鈕不存在（實為 SU 卡→drawer→drawer 內鈕，held+shipping 才有上架掛單）、發行不可重錄（同 ship+period 只發一次）→執行期時間戳唯一 IMO、掛單後 SU drawer overlay 蓋住稽核 tab→Escape 關 drawer 再點 tab；(c) agent Gemini 非確定性——單一 plan 指令只「建議」不執行寫入、指名 token 才觸發 place_carbon_order 出確認卡（但跳過 list_holdable_units 無下拉、退化手動輸入仍完整 human-in-the-loop）→改雙指令（盤點 + 祈使掛單），take1 一次命中全拍點即定稿。合成游標無 actionability 檢查→多 modal 流程（carbon）全程 waitFor 確認 modal 開/關 + page.fill 保證欄位值到位。
- **殘留 Minor（未修，交後續 triage）**：(a) recorder.mjs 偏離修正 B（pageerror→finally 後 exit）僅理論+最小 repro 驗證、未經一次真實 pageerror 端到端實測（Task 2 review 提出，錄影階段 9 支皆無 pageerror 故未觸發）；(b) cursor.mjs install() 無顯式重入防護（靠 MutationObserver disconnect 排序、理論安全）；(c) 部分片長偏離 28-36 目標：carbon 42.7s/agent 49.3s（live 含鏈上確認延遲+雙指令，旗艦模組可接受）、policy/dispatch/alert 24-26s（略短、內容完整節奏佳）；(d) agent 確認卡「折合每噸」顯「—」（未 fetch tonnage，指名 token 跳過 list_holdable_units 所致，cosmetic）。
- spec：`docs/superpowers/specs/2026-07-12-ppt-presentation-demo-design.md`；plan：`docs/superpowers/plans/2026-07-12-ppt-presentation-demo.md`（10 tasks）；ledger `.superpowers/sdd/progress.md`（scratch，未進版控）。README「簡報 Demo 影片錄製」章節記錄一鍵重錄工作流程。
- **finishing 完成**：使用者選「先這樣就好」（功能開發中、暫停）→ **ff 合併回 main + push origin main**（含 README 章節）；分支 `ppt-demo-recording` 合併後刪。**下一步（日後）**：任一頁介面／後端定案 → `npm run demo:record -- <scenario>` 單支重錄（mock→live 自動轉 chip）；想調節奏改 scenario 的 sleep 重錄。錄影管線與簡報腳本已進版控、影片 gitignored 可再生成。

**（以下為前一輪 hero 封面 chips 加數位員工 + settings 數位員工分區，已完結並 push origin main）**

**hero 封面 chips 加數位員工 + settings 數位員工分區：全案完結——SDD 5 tasks（各獨立 review Spec ✅ Quality Approved、Task 2 一個 Important「測試連線 catch 內動態 import 未保護」已修）+ 最終 whole-branch review（opus, `dd5cd3a`..`a3cbcc5` = Ready to merge: Yes、零 Critical/Important、七個 cross-cutting seam 全對照實碼通過）+ 使用者真實 Gemini key 實機驗收 OK，fast-forward 合併回 main（`dd5cd3a`→`a3cbcc5`，7 commits）+ 分支 `agent-entry-settings` 已刪 + README/HANDOFF 收尾 + push origin main。分支自 main `dd5cd3a`。**
- 動機：使用者委託全掃 agent 程式碼盤點可調參數後核可 6 項升級為 settings 欄位（geminiKey/model/測試連線/sourceMode/autoPatrol/狀態唯讀），比照既有 mapbox token「有限生效」前例——demo 現場免碰 `.env`、免重啟 dev server 即可切換 live/mock 或抽換 key；hero 封面同步補上第 7 顆「數位員工」入口 chip（總覽儀表牆語意上仍是六大功能，不動）。決策紀錄與盤點表見 `docs/superpowers/specs/2026-07-11-agent-hero-settings-design.md` §1/§4。
- **成果檔案**：新增 `src/screens/agent/config.ts`（`effectiveKey`/`effectiveModel`/`isLive` 三純函式，settings 覆寫 `.env` 的唯一真相）+ `src/screens/settings/sections/agent.ts`（數位員工分區：Group1「Gemini 連線」explicit 存/棄語意含 `測試連線` action、Group2「行為」instant 含 `sourceMode`/`autoPatrol`、Group3「狀態」唯讀 custom）+ `tests/{agent-config,settings-agent-section}.test.ts`（15 tests）。接線改動（只換三個既有讀取點，不動引擎邏輯）：`src/screens/settings/index.ts`（註冊 `agentSection`，緊接 `alertSection` 之後）、`src/screens/agent/index.ts`（header chip 改讀 `isLive()` + `subscribe('agent.geminiKey'/'agent.sourceMode')` 即時跟隨、`greet()` 支援 `rep===null` 的「自動巡檢已停用」分支、`show()` boot 判斷改讀 `getSetting('agent.autoPatrol', true)`）、`src/screens/agent/controller.ts`（live/mock 分派與 `runGemini` 呼叫改用 `isLive()`/`effectiveKey()`/`effectiveModel()`）、`src/screens/agent/loop.ts`（`MODEL` 常數改為 `runGemini` 的 `model?` 參數、`friendlyError` 金鑰無效文案補「系統設定「數位員工」分區」字樣）、`src/screens/hero/index.ts`（`chipMods = SCREENS.slice(1,8)` 供封面 7 chips、`cardMods = SCREENS.slice(1,7)` 供總覽 6 卡，兩者拆開不再共用同一個 slice）。
- **SDD 5 tasks（各自逐 task 獨立 review）**：(1) `ce129cf` config.ts 三純函式 TDD；(2) `63e23cd` settings 數位員工分區（+ fix `0a168d2`：測試連線 catch 內動態 import 加巢狀 try/catch 保證 never-throw，比照 `testCarbon` 絕不拋錯契約——Task 2 review 抓到的 Important）；(3) `1f6d4df` 三個既有讀取點改走 config.ts（chip subscribe / autoPatrol boot gate / model 參數，Task 3 review 用 opus，五個 cross-cutting risk 全 trace clean）；(4) `2f519b3` hero chips 六變七；(5) `762e35a` 全站驗收 + HANDOFF（純文件無產品碼，併入最終 whole-branch review），spec/plan 另 commit `a3cbcc5`。全 7 commit author=charles、無 Claude/Anthropic 署名。
- **驗收（Task 5，本輪，誠實分野）**：三綠燈——`tsc --noEmit` 0、`vitest run` 26 檔 123 tests 全綠（基線含本輪新增 15 tests）、`build` 成功。CDP 全站迴歸（獨立 headless Chrome + SwiftShader :9477、自起 dev server :5199 以 `VITE_GEMINI_API_KEY=` 空值 override 另起、未動使用者 `.env`/既有 `:5173`/`:5174`/`:8000`，跑畢已清自己起的進程）：spec §5 全 8 項驗收清單 47/47 斷言 PASS——① hero 封面 7 chips（第 7 顆數位員工紫 `#B48CFF`、點擊跳轉）+ Enter→總覽仍 6 卡；② settings 數位員工分區排在 alert 之後、3 groups 正確渲染、`geminiKey` 遮罩、explicit 存/棄語意正確；③ dummy key（`dummy-invalid-key`，僅存 localStorage 非 `.env`）存檔後，**agent screen 當下仍隱藏於 DOM（router 快取式、mount 過的 screen 永不卸載）也已由 `subscribe` 即時切成「GEMINI LIVE」**——比「切過去才看到」更嚴格地證明訂閱在背景生效；切換過去送指令走 live 路徑，`Network.requestWillBeSent` 捕捉到真打 `generativelanguage.googleapis.com`、Gemini 真回 400，thread 顯示 `friendlyError`「Gemini 金鑰無效或未授權——檢查系統設定「數位員工」分區或 .env 的 key」（非原始 JSON dump）；④ `sourceMode=mock` 同樣隱藏態即時生效，送指令改走劇本（3 步 plan 渲染、Gemini 請求數送出前後不變）；⑤ 測試連線：key 清空→「未設定 key」（零 API 呼叫）、dummy key→金鑰無效訊息（Network 請求數 +1，證實真打了一次）；⑥ `autoPatrol=off` 存檔 + **真正整頁重載**（`Page.navigate` 兩段式，非僅切 hash——模組頂層 `booted` 變數才會重置）直達 `#/agent`：無 `.lampwall` 燈牆、招呼泡泡含「自動巡檢已停用」、3 chips 照顯可點；`=on` 同法重載 → 7 張 lampcard（6 模組+設定）全亮、招呼帶健檢結論；⑦ 9 頁鍵盤 sweep `0`-`8` 全對映 + 版面非空、`#aInput` 內打數字走真實冒泡路徑仍不誤觸導覽；⑧ console 全程零 JS 例外。截圖 6 張（hero chips 換行觀感/總覽/settings 分區/測試連線/autoPatrol 開關兩態）存 scratch。
- **環境註記（非本輪缺陷）**：CDP 驗收時 autoPatrol 健檢結論顯示「政策模組異常」，因 rag-agent（`:8100`）本機未啟動，沿用歷次 HANDOFF 已記錄的既有事實，非本輪改動所致。
- **誠實分野（SDD session 內）→ 使用者實測已補齊**：SDD session 內 dummy key 只驗證「模式切換 + 錯誤路徑」，設定頁 key 的完整成功案例當時留待使用者驗；**使用者已於 2026-07-11 以自己的 Gemini key 實機驗收——設定頁填 key→標題列即時切「GEMINI LIVE」→live 對話正常 = OK**（測試連線「連線成功」訊息亦一併確認）。合併 push 前的收尾即基於此實測通過。
- **殘留 Minor（未修，交後續 triage）**：(a) `tests/settings-agent-section.test.ts` 未涵蓋 `testGemini()` 的兩條 async 分支（未設定 key 短路 / 呼叫 Gemini 成功或失敗）——函式內部動態 `import('@google/genai')`/`import('../../agent/loop')`，現有測試只驗 schema 契約與欄位存在性、不模擬 fetch，CDP 本輪已補這兩條路徑的實機驗證；(b) `src/screens/agent/index.ts` 的 `mount()` 呼叫兩個 `subscribe(...)` 回傳的 unsubscribe 函式未接住、未於任何生命週期呼叫——因 agent screen 走快取式 router（`mount()` 全站僅呼叫一次、永不卸載），不構成記憶體洩漏，屬「該接未接」的殘留；(c) 附帶記錄（非本輪缺陷、不擅改）：`index.html` 第 18 行固定提示列 `<div id="hint">1-6 功能頁 · 0 總覽 · Enter 封面切換</div>` 為靜態字串，自專案骨架初始提交起即未再更新，鍵盤實際已支援 `0`-`8`（agent/settings 為更早輪次加入），本輪 `index.html` 零 diff，不屬本輪回歸。
- spec：`docs/superpowers/specs/2026-07-11-agent-hero-settings-design.md`；plan：`docs/superpowers/plans/2026-07-11-agent-hero-settings.md`；逐 task 報告 `.superpowers/sdd/task-{1..5}-report.md`（scratch，未進版控，注意此路徑被多輪重複使用）。

**（以下為前一輪 Agent 操作體驗 Refine，已完結並 push origin main）**

**Agent 操作體驗 Refine（數位員工 screen 操作體驗打磨輪）：全案完結——SDD 5 tasks（4 功能 + 驗收）+ 最終 whole-branch review（opus, 3fe240f..da96ebb = Ready to merge: Yes）+ fix wave（TOOL_LABEL 友善字 + loop.ts abort guard）全數過關，本地 fast-forward 合併回 main（`3fe240f`→`ac30ac8`）+ README/截圖（`85ed69a`）+ push origin main。使用者實機測試 live 互動掛單 + SUGGEST = OK。分支 `agent-ux-refine` 合併後已刪。**
- **合併脈絡更正（前一版 HANDOFF 敘述有誤）**：`agent-screen`（8-task 初建）本 session 稍早已完成最終 review + 2 fix wave 並 fast-forward 合併回 main（`0886f72`→`8ceba6e`）；`agent-ux-refine` 自合併後的 main（refine spec/plan `3fe240f`）分出、完成後再 ff 合併回 main（`ac30ac8`）。兩輪皆已 push origin main（`85ed69a`）。前一版 HANDOFF 誤稱「agent-screen 尚未合併、同一條分支」，實為兩條先後合併的分支——此更正以 git 歷史為準。
- 動機：`agent-screen` 8-task 初建完成後，使用者提出四項操作體驗打磨需求（見 `docs/superpowers/specs/2026-07-10-agent-ux-refine-design.md` §1 決策紀錄表）：①掛單卡原本只能盲打 token_id，應改成挑真實持有的 SU；②工具卡只顯示「完成」字樣，應顯真實模組數據；③回答結束是死胡同，應有 SUGGEST 追問 chip；④錯誤訊息是原始例外字串、停止鈕要等 in-flight fetch 才復原。先落地版面回饋（對話/工作區改 50/50，commit `dc846d5`），再依序 SDD 4 個 task。
- **契約改動（Task 1，`7abdb04`）**：`src/data/types.ts` 的 `AgentEvent`：`tool_result` 加 `cardHtml?: string`、`error` 加 `detail?: string`、新增 `suggest` 事件種類（`items: string[]`）；新增 `export interface ConfirmResult { ok: boolean; args?: Record<string, unknown> }` 取代原本 `waitConfirm` 回傳的裸 `boolean`（breaking change，`replay.ts`/`loop.ts`/`controller.ts` 三處同步改）。`replay.ts` 的 confirm 分支若 `ok:true` 且帶 `args`，覆寫下一個同名 `exec` tool_call 的參數（供互動卡「使用者挑的值」真正打到後端）。
- **tools.ts（Task 2，`bd273d2`）**：新增 `list_holdable_units` 工具——繞過 provider 直打 carbon `/state`，篩 `status==='held'`（cap 50），回傳 `{token_id,amount}[]` 供互動卡下拉；`place_carbon_order` 失敗語意拆兩路：後端未啟動（fetch throw）維持「示範模式」語意，後端有回應但非 2xx（如 SU 已上架）改成「掛單失敗（HTTP status）」誠實訊息、不再誤標「示範」；`get_module_data`/`ask_policy_rag` 成功分支加 `moduleCardHtml`/`cardHtml` 組字（缺欄位 optional chaining 不炸），供右欄工作區顯示真實模組數據而非「完成」空字。
- **loop.ts（Task 3，`47d27e9` + fix `1e4b552`）**：`parseSuggest`/`splitEmittable`/`friendlyError` 三個純函式 TDD——SUGGEST:: 尾行緩衝到換行或流結束才判定（防 chunk 切半誤判），末輪解出的追問建議在 `done` 前 `yield {kind:'suggest'}`；`friendlyError(raw)` 四路徑（金鑰無效/網路失敗/額度用盡/其他通用+detail 截 120 字）取代原始例外字串直接上牆。**Fix wave 1**：live functionCall 原本在呼叫當下就寫入 `history`（記的是 agent 建議的原始參數），改成 confirm 之後才寫入（`calls.map` 移到 for-loop 之後），使 history 記錄的是使用者在互動卡上最終確認/修改過的參數，不失真。
- **controller/workspace/agent.css（Task 4，`74d8bb1` + fix `4d379b7`）**：新增 `renderOrderCard`（`place_carbon_order` 專用互動確認卡，緊鄰既有 `renderConfirmCard`）——SU 下拉吃任務內快取 `lastHoldable`（agent 建議的 token_id 命中則預選，清單空退化手動輸入）、總價輸入以建議價 prefill、`updatePer()` 即時算折合每噸、市場脈絡行讀快取 `lastCarbon`（流通噸數+掛單中筆數）；`suggest` 事件渲染 `.schips`/`.schip`，點擊即送出該追問文字為新任務（新任務開頭清上一組 chips）；停止鈕改「即時回復」——`stop()` 當下同步 `running=false`+`setInputMode('idle')`+`ws.markStopped()`，不等 in-flight fetch 收尾。**Fix wave 2**：停止即時回復讓使用者能在舊任務 in-flight 時就送新任務，`runTask` 的事件消費迴圈原本只有 `finally` 收尾有 supersede guard、迴圈本身沒有，導致舊任務的遲到 `tool_result` 可能污染新任務的右欄卡片；修法為迴圈加一行 `if (ctrl !== myCtrl) break`（沿用既有 `myCtrl` 快照變數，同 `finally` guard 哲學），只動 `controller.ts` 一行，不碰 engine。
- **Defer Minor（留待後續 triage）**：`loop.ts` 的 `runTool` 呼叫後仍缺 abort guard（`replay.ts` 每個 checkpoint 都有 `if (io.signal.aborted) return`，`loop.ts` 沒有）——stop 後 live 態的 in-flight fetch 仍會在背景跑完，只是結果被 controller 端的 supersede guard 安靜丟棄、不觸發任何 UI 副作用，不會造成資料錯亂，但不是真正的請求中斷；根治需在 `loop.ts` 補比照 `replay.ts` 的 abort 檢查，超出本輪「只動 controller.ts」的範圍。
- **本輪 Task 5 驗收（誠實分野）**：三綠燈——`tsc --noEmit` 0、`vitest run` 24 檔 108 tests 全綠（基線含前四 task 新增案例）、`build` 成功。CDP 全站迴歸（獨立 headless Chrome + SwiftShader、mock 態以 `VITE_GEMINI_API_KEY=` 空值 override 另起 dev server，比照 Task 4 手法，未動使用者 `.env`/既有 `:5173`/`:5174`/`:8000`/`:8545`）：9 頁 sweep 鍵盤 `0`-`8` 全對映 + 版面非空（18/18 PASS，含一次因 policy probe 3s timeout（rag-agent :8100 未啟動）導致的初次時序假象，加長等待後穩定重現通過，非產品缺陷）；agent 開場巡檢（招呼泡泡+3 建議 chips）、`#aInput` 聚焦打數字不跳頁、citation chip 點擊即時 hash 導覽+返回 thread 內容保留、suggest chip 點擊送出新任務且舊 chips 同步移除、console 全程零例外；補充第二輪（5/5 PASS）：`prefers-reduced-motion:reduce` 下開場巡檢與互動掛單卡功能不受影響、sc-order 互動卡端到端真打 carbon `:8000` `/list`（選的 SU token_id 7 確認前後 `held→listed`、held 計數 103→102，証實兩波 fix 之後掛單全流程仍正確）。live 態驗證：dummy key（`VITE_GEMINI_API_KEY=dummy-invalid-key-for-testing` 另起 dev server，未動 `.env`）驗 friendlyError——標題列正確切「GEMINI LIVE」、Gemini 真回 400 `API_KEY_INVALID`、UI 顯示友善訊息「Gemini 金鑰無效或未授權——檢查 .env 的 VITE_GEMINI_API_KEY 後重啟 dev server」（非原始 JSON dump，符合 `friendlyError` 該分支不含 detail 的設計——detail 小字只在無法識別的例外訊息時才出現，見 `tests/agent-plan.test.ts` 的 `friendlyError` 4 案例）、輸入列即時復原、零 uncaught exception。導航排程（`pendingNav`/`navTimer`）因 mock 劇本從未呼叫 `navigate_to_screen` 工具（只有 live/Gemini function-calling 路徑會觸發，`agent-scenarios.json` 4 劇本皆無此工具呼叫，沿用自 Task 7 起的既有事實），本輪以程式碼檢視核實 `submit()` 開頭清空 `navTimer`/`pendingNav` 的既有 guard（Task 7 `732575b` 引入）未被本輪任何改動觸碰，未迴歸。
- **live 實機驗收（已完成，2026-07-11）**：使用者以自己的真實 Gemini key 測試 live 態完整互動掛單流程（Gemini 先呼叫 `list_holdable_units` → 互動卡挑選 SU + 改總價 → 確認 → 真上鏈 held→listed）與 SUGGEST chips 跟隨真回答＝OK。（SDD session 本身僅驗 mock 態全流程 + dummy key 錯誤路徑，真實成功案例由使用者這輪實測補齊。）
- spec：`docs/superpowers/specs/2026-07-10-agent-ux-refine-design.md`；plan：`docs/superpowers/plans/2026-07-10-agent-ux-refine.md`（5 tasks）；逐 task 報告 `.superpowers/sdd/task-{1,2,3,4,5}-report.md`（scratch，未進版控）。

**（以下為 數位員工 Agent Screen 初建輪，已完結並 fast-forward 合併回 main（`8ceba6e`）+ push origin——refine 輪自合併後的 main 另分出 `agent-ux-refine` 再合回，兩輪為先後兩條分支、皆已合併已刪）**

**數位員工 Agent Screen（第 9 個 screen）改版：SDD 8 tasks 全數完成（逐 task review Spec ✅ Approved、含 Important 已修）+ 最終 whole-branch review（opus, Ready to merge）+ 2 fix wave（get_module_data live 補模組卡/足跡、submit 清 navTimer），已 fast-forward 合併回 main（`0886f72`→`8ceba6e`）並隨後 push origin。分支 `agent-screen`（自 main `b755a08`）合併後已刪。**
- 定位：第 9 個 screen，插在 alert 之後、settings 之前（rail 鍵盤：agent 接手 `7`，settings 改 `8`）。「數位員工」AI Agent 頁——使用者以自然語言下指令，Agent 透過 tool-calling 讀取/導航/操作其他六大模組的資料層，把生態系串連起來；並能跑系統自我檢測，依 runbook 給修復建議。競賽簡報的收官頁，模組色紫 `#B48CFF`、mode `doc`。
- 核心抽象：`AgentEvent` 事件流（`plan`/`step_start`/`tool_call`/`tool_result`/`text_delta`/`confirm_request`/`done`/`error`），live（`loop.ts`，Gemini manual loop）與 mock（`replay.ts`，劇本 replay）皆為 `AsyncGenerator<AgentEvent>`，UI（`index.ts`/`controller.ts`/`workspace.ts`）只消費事件、不知道背後是真 LLM 還是劇本。七工具（`tools.ts`）：`get_module_data`/`ask_policy_rag`/`run_diagnostics`/`search_runbook`/`navigate_to_screen`/`place_carbon_order`（寫，需確認卡）/`update_setting`（寫，需確認卡，白名單 key）。自我檢測分工：確定性 probe（`diagnostics.ts`，不進 LLM）+ 靜態 runbook JSON（`agent-runbook.json`，8 條）。
- UX 1-7 全做（開場即巡檢／plan-then-act／常駐旁白／工作區跟隨+足跡回看／確認卡 human-in-the-loop／模組色 citation chips `{{m:module}}`／隨時中斷）；8（足跡收據行）不做（brainstorming 定案）。
- **成果檔案**：新增 `src/screens/agent/{index.ts,agent.html,agent.css,loop.ts,replay.ts,tools.ts,diagnostics.ts,workspace.ts,controller.ts}` 九檔 + `src/data/mock/{agent-scenarios.json,agent-runbook.json}` + `tests/{agent-mock,agent-diagnostics,agent-tools,agent-replay,agent-plan}.test.ts` 五檔；`src/data/types.ts` 檔尾追加 `AgentModule`/`AgentEvent`/`DiagReport`/`DiagModuleReport`/`RunbookEntry`/`ScenarioEvent`/`AgentScenario`；`src/shell/registry.ts`（第 9 筆 ScreenDef）、`src/main.ts`（鍵盤 `7`→agent、`8`→settings）、`package.json`（+`@google/genai`）、`.env.example`（+`VITE_GEMINI_API_KEY=`）為接線改動，不動任何既有 screen/provider 邏輯。
- **SDD 8 tasks（每個獨立 code review）**：(1) 資料契約 + runbook/劇本 mock JSON TDD；(2) 確定性健檢 probe TDD；(3) 七工具 + `renderAgentText`（`{{m:module}}`→citation chip）TDD；(4) 劇本 replay 引擎 TDD；(5) Gemini manual loop + `parsePlan` TDD；(6) screen 骨架 + shell 接入 + 開場巡檢；(7) chat 控制器 + 事件渲染全鏈路（mock 劇本可互動）+ 修復（submit 清前次導航排程、chips 執行中不誤消耗）；(8) 本輪：全站驗收 + README/HANDOFF 收尾。
- **驗收（誠實分野，Task 8 本輪）**：三綠燈——`tsc --noEmit` 0 errors、`vitest run` 23 檔 85 tests 全綠（新增 agent 五檔）、`build` 成功；build 後佐證 `@google/genai`（382.6KB）只落在 agent screen 的獨立 async chunk（`index-KajQcvrz.js`，由 registry 的 `load: () => import(...)` 動態載入），主 entry chunk（`index-CpvW_cqy.js`，91.8KB）未增胖，grep 確認引用方式是動態 `import()` 非 eager。key 紅線稽核：`git status` 確認 `.env` 未追蹤、`grep -rn "AIza" dist/ src/` 零命中、README 已註記 key 僅限本機。CDP 全站迴歸（獨立 headless Chrome + SwiftShader，勿加 `--disable-gpu`，自起 dev server :5183 + Chrome :9463，不動使用者另開的 :5173/:8000）：9 頁 sweep（hero→carbon→policy→twin→dispatch→epidemic→alert→agent→settings）全數 `.screen.active` 正確 + 版面非空、鍵盤 `0`-`8` 全對映、twin WebGL context alive、carbon 單筆發行 modal／policy `#qinput` 打數字皆不誤觸導覽（既有 bail-out 不迴歸）、agent 頁 `prefers-reduced-motion` 首次 boot 完整非空白（7 燈全亮＋招呼泡泡＋3 chips，無 stagger）；agent mock 態互動細項（10/10）：開場巡檢、sc-summary 劇本（plan 3 步/工具卡 3/citation chip 3）、citation chip 點擊跳頁+返回 thread 保留、sc-diag 健檢（碳權離線態下 runbook 命中「make chain」，用 app 自身 `carbon.apiBase` 設定導向死埠模擬離線、不影響使用者另開的真 :8000）、掛單確認卡取消/確認兩路徑（確認後 carbon 離線故退示範回覆）、執行中按停止（輸入列復原+收尾語）、亂打→誠實 FALLBACK 說明、`#aInput` 打數字不跳頁；全程**console 零 JS 例外**。
- **live 態驗證（誠實分野，真實 Gemini key 待使用者驗）**：本 session 不可得真實 Gemini key，改以 dummy key（`VITE_GEMINI_API_KEY=dummy-invalid-key-for-testing`，測試後已移除、`.env` 確認未進版控）驗證「模式切換 + 錯誤路徑」——(a) 標題列 chip 正確切成「GEMINI LIVE」；(b) 送出指令走 live 路徑，dummy key 使 Gemini API 真的回 400 `API_KEY_INVALID`（證實是真實 API 往返，非模擬），`loop.ts` 的 try/catch 接住並 yield `error` 事件，UI 出現 `.aerr` 錯誤列、輸入列復原、頁面不崩潰、**零 uncaught exception**；(c) 移除 dummy key 重啟後正確退回「劇本 MOCK」chip。**真實 key 的完整成功案例（真答案＋真工具呼叫＋掛單真打碳權 API）仍留待使用者以自己的 Gemini key 驗證**，本輪未也不應假裝跑過真 Gemini。
- **四個 defer Minor（交最終 whole-branch review triage）**：(a) `stop()` 不取消 in-flight `fetch`（Gemini stream 或工具內部的 fetch 仍會在背景跑完，只是結果不再被消費）、`stop()` 亦不即時復原輸入列以外的殘留 UI（demo 多停在 `sleep` 階段風險低）；(b) `lastToolSummary`（citation chip hover 摘要）跨任務不重置，理論上可能 hover 到舊任務的摘要文字；(c) `controller.ts` 的 `runTask()` 的 `try` 區塊從 `io` 物件建好之後才開始，若 setup（同步 DOM 操作）本身 throw，`running` 旗標會卡在 `true`（同步 DOM 操作正常不會 throw，實務風險低）；(d) `loop.ts` 的 manual loop 若中間輪（非最後一輪）模型先吐文字才吐 `functionCall`，該輪文字目前未寫入 `history` 的 model turn（只有最終無 functionCall 的收尾回合才整段寫回）——多輪追問情境下前面步驟的說明文字會遺失於歷史，但最終回答文字有保留，demo 場景多為單輪對話，此邊界情況風險低。
- 設計文件：`docs/superpowers/specs/2026-07-10-agent-screen-design.md`（決策表/版面/AgentEvent/七工具/自我檢測/UX 1-7/雙態 provider/驗收標準/風險）；實作計畫 `docs/superpowers/plans/2026-07-10-agent-screen.md`（8 tasks）；逐 task review 見 `.superpowers/sdd/review-*.diff`；完整驗收證據 `.superpowers/sdd/task-8-report.md`（scratch，未進版控）。

**（以下為前一輪 Policy/Settings mock fallback 整合，已完結並合併回 main + push origin）**

**本次合併（2026-07-10）：Policy/Settings mock fallback 整合（本輪）已本地合併回 main，連同協作者 PR #1 `feat/policy-rag-integration`（policy/settings 接 rag-agent live）一併進 main + push origin。以下各段依 git 順序列出已完結各輪（hero → 本輪 policy mock fallback → alert → …），皆已在 main；本輪技術條目見本節下方「Policy/Settings mock fallback」段。**

**（前一輪）Hero 頁改版：SDD 三 task 完成 + 最終 whole-branch review（Ready to merge），已合併回 main（fast-forward `c1a2490`→`ab0a89e`）+ push origin + README 畫面展示；分支 `hero-redesign` 已刪。（原 baseline `c1a2490`）**
- 定位：**PPT 開場封面 + 戰情總覽**兩段式。封面改為「電影感中置標題 + 六模組 chips（同色點錨定）+ ENTER CTA」、
  底圖從舊的 `#harbor` canvas 點雲假資料換成**自架波浪 loop 影片**（`src/screens/hero/hero-bg.mp4`，1.4MB、
  H.264、1620×1080、無縫 loop）+ gradient scrim 壓對比；Enter/點擊/`hero:toggle` → **總覽「模組儀表牆 3×2」**
  （六卡＝色點 + mono 數值 + 對色 sparkline，讀 overview mock 的 `modules.trend`）+ LIVE chip + KPI 行。
  chips/CTA 用半透明實色（不對 video 套 filter/blend），模組卡走 `lg lg-static`（無手寫 backdrop-filter）。
- **成果檔案**：`src/screens/hero/{hero.html 重寫,index.ts 重寫,hero.css 新增,hero-bg.mp4 新增,hero-poster.jpg 新增}`
  + 刪 `ovmap.ts`；`src/data/types.ts`（OverviewSnapshot：`modules` 加 `trend`、刪 `sparks`/`weekly`/`delta`）
  + `src/data/mock/overview.json`（全面改寫）+ `src/ui/tokens.css`（清 hero 舊段：`.cover`/`.modcard`/`.entry`/
  `.entries`/`.overview`/`.ov-head`/`.mapbox`/`.tagrow`/`.modrow` 等，grep 佐證無 hero 以外引用）
  + `tests/overview-mock.test.ts` 新增（vitest 16 檔 61 → 17 檔 63）。
- **SDD 三 task（各獨立 code review 皆 Spec ✅ + Quality Approved）**：(1) OverviewSnapshot 契約改版 + mock 改寫
  + hero 降過渡殼 TDD；(2) 影片資產 + hero 全面重寫（hero.html/index.ts/hero.css）+ tokens.css 清舊（CDP 28/28）；
  (3) 全站迴歸驗收 + 本文件收尾（純驗收，除 HANDOFF.md 外不動產品碼）。
- **驗收（誠實分野）**：三綠燈全過（`tsc` 0 / `vitest` 17 檔 63 tests / `build` ok；`hero-bg.mp4` 為獨立 asset
  1,428,625 bytes、非 inline）。純邏輯（overview mock 契約：`modules.trend` 長度、kpi 五欄）走 vitest；
  渲染/影片生命週期/鍵盤/reduced-motion 以獨立 headless Chrome + CDP（port 9455、SwiftShader flags、勿加
  `--disable-gpu`、前景同步 + 硬 watchdog、跑畢自行 pkill 無殘留）逐項實機驗證——**8 頁全站迴歸全 PASS**：
  hero 封面 video 播放 + currentTime 前進、Enter→總覽（`data-hero=ov`）、8 頁 sweep 逐頁 `.screen.active` 正確
  + 版面 `w=1620` 非空、carbon `.fchip .n`／policy `.gbar` 跨頁補償正常、twin WebGL context alive、鍵盤
  `Enter`/`1`/`0` + 生命週期（切走 video 暫停、`0` 切回 video 恢復播放且**總覽態保留**）、carbon modal 輸入框
  打數字不跳頁（既有 bail-out）、reduced-motion 全站（hero 顯 poster 靜態 video.paused + autoplay 移除、
  其餘頁完整渲染非空白）、**console 全程零 JS 例外**。**驗收零缺陷。** 完整逐項證據見
  `.superpowers/sdd/task-3-report.md`（scratch，未進版控）。
- 設計事實與 schema/決策見 `docs/superpowers/specs/2026-07-08-hero-redesign-design.md`；實作計畫
  `docs/superpowers/plans/2026-07-08-hero-redesign.md`（3 tasks）；逐 task review 摘要見 `.superpowers/sdd/`。
- **待最終 whole-branch review triage 的殘留（非缺陷，Task 2 review 提出、已於驗收再確認不影響）**：
  (a) `#ovMap`/`.cols` 為 tokens.css 孤兒死 CSS（新版 hero 已移除 `<canvas id="ovMap">`，現無消費者；不在 Task 2
  刪除清單，依 CORE RULE 未擅自清）；(b) `sparkPoints` 對長度 1 的 trend 會產生 NaN（現行 mock 六模組 trend
  皆長度 7，不觸發）；(c) 全域 `.stack`（tokens.css）保留——policy 使用 `class="stack"`，刪除對其無實害但保守
  保留。三項交最終 whole-branch review 決策是否收斂。
- demo/競賽前建議：真 Chrome 人工 click-through 一輪（封面影片觀感 / 總覽儀表牆 stagger / chips hover / Enter 轉場手感）；
  carbon LIVE 需先起 PoC 後端（:8000）。

**（本輪，已合併進 main）Policy/Settings mock fallback 整合：已隨本分支本地合併回 main（連同協作者 PR #1）+ push origin。SDD 5 tasks 通過逐 task review + 最終 whole-branch review（opus, Ready to merge）+ 全站功能實機驗收；合併採非 ff merge（保留 main hero）、HANDOFF 手動解衝突、README/`types.ts` auto-merge。**
- 動機：PR #1（`9033aba`）把政策報告頁與系統設定接上 rag-agent 真後端，但後端（rag-agent :8100）未啟動時，settings 的「知識庫管理」分區與「模型管理」測試連線皆無平滑退場（前者顯示連線失敗文案、後者顯示連線失敗而非示範狀態），demo 現場若後端未起會露出半成品畫面。本輪任務：在**不動 PR #1 任何既有邏輯**的前提下，於 `src/screens/settings/sections/policy.ts` 補上三個 mock fallback 整合點。
- **三整合點**：① 知識庫分區——`refresh(initial)` 首次載入 `listSources()` 失敗時整組退回 `mountMockKb(el, ctx)`（還原自 main 版 kbGroup.custom 的原版 mock 卡牆，5 庫預置 + `.gbadge.wait` MOCK chip）；② 模型管理測試連線——`testBtn` catch 分支不再顯示「連線失敗」，改退回示範驗證（訊息帶「（示範）」低調標示，沿用原 mock 流程載入 catalog 模型）；③ live 知識庫 modal 新增「檢索策略」區塊（`strategyBlockHtml`/`bindStrategyBlock`），存本機 `policy.kbParams`（存而不用，後端無對應 API，之後支援時只改讀取點）。
- **成果檔案**：新增 `src/screens/settings/sections/policy-kb-mock.ts`（`mountMockKb`/`strategyBlockHtml`/`bindStrategyBlock`/`KbParams`/`defaultKbParams`/`getKbParams`/`setKbParams`）+ `tests/settings-kb-params.test.ts`（2 tests）；`src/screens/settings/sections/policy.ts` 僅五個插入點改動（`export setKbs`、`custom(el, ctx)`、`refresh(initial)`+import、testBtn catch、modal 拼接+bind+load），逐行核對零其他 PR 邏輯被動。
- **SDD 5 tasks**：(1) `0d4f22a` policy.kbParams 本機檢索參數資料層 TDD；(2) `d3e967a` 知識庫分區退回原版 mock 全套；(3) `35bfceb` 測試連線退回示範驗證；(4) `ec3480c` live modal 檢索策略區塊接線；(5) 本 task（全站驗收 + 本文件）。spec/plan：`docs/superpowers/specs/2026-07-09-policy-mock-fallback-design.md` / `docs/superpowers/plans/2026-07-09-policy-mock-fallback.md`。
- **驗收（Task 5，本輪）**：三綠燈——`tsc --noEmit` 0 errors、`vitest run` 17 檔 63 tests 全綠（brief 原估「18 檔 65」，實際新增檔僅 kb-params 一檔 2 tests、基底為 16 檔 61 tests，屬估算落差非產品碼缺陷）、`build` 成功。「PR 功能不動」diff 驗證：`git diff origin/feat/policy-rag-integration...HEAD --stat` 僅 5 檔（docs spec/plan、`policy-kb-mock.ts` 新檔、`policy.ts`、`settings-kb-params.test.ts` 新檔）；`src/data/exchange/policy.ts`/`backend.ts`/`src/screens/policy`/`types.ts`/`main.ts`/`settings.css` 零 diff；`policy.ts` 逐行核對僅含五插入點，無其他邏輯被動。CDP 全站迴歸（獨立 headless Chrome + SwiftShader、勿加 `--disable-gpu`，rag-agent :8100 全程未起）：8 頁 sweep 全數 `.screen.active` 正確 + 版面非空；policy 頁綜合對話正確退回 mock 情報聯集（文案「已就緒」而非「已接入」，PR 既有 fallback 不迴歸）；settings 政策報告分區退回 mock 卡牆（5 庫）+ MOCK chip；模型管理測試連線顯示「（示範）」；settings 輸入框內打 `1`-`7` 不跳頁（既有 bail-out）；`prefers-reduced-motion:reduce` 下 settings 分區完整渲染非空白；**console 全程零 JS 例外**（23/23 斷言全過）。
- **驗收環境註記**：carbon 後端（:8000）當時已由使用者另行啟動（非本 session 所起，權限限制下未停用）；因 carbon 相關路徑本輪為零 diff 且與 policy/settings mock fallback 無關，不影響驗收結論，僅此記錄環境狀態以求誠實。
- **main 分支狀態提醒（hero 已完結，本分支尚未包含）**：`main` 另於 2026-07-08 完成「hero 影片底圖改版」（分支 `hero-redesign`，3 tasks：`9425455`→`696cab3`→`72d88b8`→`ab0a89e`→`4bd2be3`，封面改中置＋六模組 chips、總覽改模組儀表牆 3×2、底圖換自架波浪 loop 影片），已完結並 push 到 origin main。**該輪工作在本分支（`policy-mock-fallback`，fork 自 alert 收尾點 `c1a2490`）尚未包含**——`main` 的 HANDOFF.md 首行「最後更新」仍殘留「待最終 whole-branch review → 使用者實機驗收 → finishing」字樣，實為過時敘述（hero 已完結並 push，該行待 main 那側之後更新，非本分支所能修正）；本分支合併回 main 時需留意此分岔，依「PR #1 先進 main、本分支再跟進」順序處理，跟進時會自然帶入 main 當下狀態（含 hero 改版）。

**（以下為前一輪 Alert 頁改版，已完結）**

**Alert 頁改版：全案完結並 push 到 origin。SDD 6 tasks + 最終 whole-branch review（opus，Ready to merge）+ 兩項最終修復，本地合併回 main（fast-forward `94a896a`→`7f6b437`、feature 分支 `alert-redesign` 已刪）；合併後兩筆 follow-up：(a) 手機 mock 比例微調（使用者回饋——`.phone` aspect-ratio `9/18.5`→`9/16` + max-width `230`→`205px`，改成窄身 16:9、減少空白，alert.css + preview 同步；systematic-debugging 確認非溢出而是比例過高），(b) README「畫面展示」加 alert 段 + `docs/screens/alert.png`（紅色警報頂格全港廣播，SwiftShader 3200×2000）。合併後 main 三綠燈 tsc 0 / vitest 16 檔 61 / build ok。已 push origin。六大功能頁深度改版全部完成。**
- 定位：**獨立警報中心**——港區事件（疫情/派工/氣象）經分級規則引擎，以 Cell Broadcast 推播；
  事件卡帶來源模組色點呈現跨模組關係。版面 A 三分割（左事件流 / 中 Mapbox 高雄港覆蓋地圖 /
  右手機 mock + 送達漏斗）+ KPI 4 卡；分級＝港區三級（紅色警報/橙色警戒/作業提示）+ PWS 對映
  mono `CH 4371/911/919` 徽章（調研沉澱：台灣 CBS 官方分級與訊息碼、WEA polygon geo-targeting、
  J-Alert 波紋、Grafana 狀態機、OneSignal 漏斗、NOC 5 秒可讀原則）。
- 四互動全做：點事件下鑽（flyTo+圍欄+cell 點亮+漏斗切換+卡內分級軌跡展開，互斥）、模擬事件池
  兩發（作業提示雷擊 → 紅色警報颱風頂格：cell 全亮 stagger+波紋+手機全螢幕插播抖動+雙漏斗滾數字，
  第三按重置、動畫中防重入）、cell hover tooltip 送達數、Ack 鈕（脈動→靜止）。無解釋性散文（卡
  摘要/軌跡全數據化）+ 引導性配色（橙紅級標題常態帶 sev 色、選中卡光暈跟 sev 色）+ 進頁自動選中
  最高風險事件（重置亦然，不留空地圖）。獨立分級切換器不做；舊三顆推播規則 switch 移除。
- **成果檔案**：`src/screens/alert/{funnel.ts 新增,broadcastmap.ts 新增,index.ts 重寫,alert.html 重寫,
  alert.css 新增}` + `src/data/types.ts`（AlertSnapshot 全面改寫：AlertSev/AlertFunnel/AlertTrace/
  AlertSms/AlertEvent/AlertCell）+ `src/data/mock/alert.json`（全面改寫，逐字轉錄自驗收 preview v2）+
  `src/ui/tokens.css`（刪 alert 舊佔位段）+ `tests/{alert-funnel,alert-mock}.test.ts` 新增；接線只換
  讀取點：`src/screens/carbon/carbon.css`（還原 `.fchip .n` 等寬字，補償 tokens 清理的回歸）。
- **SDD 6 tasks（每個獨立 code review 皆 Spec ✅ + Quality Approved）**：(1) funnel.ts 送達漏斗
  轉換率純函式 TDD；(2) AlertSnapshot 新契約 + mock 逐字轉錄 + 降過渡殼 TDD；(3) 三分割骨架 +
  alert.css（#s-alert 前綴、keyframes 改名 aackpl/apd/arip/ashk）+ 靜態渲染（篩選/Ack/軌跡展開/
  自動選中）+ tokens.css 清舊；(4) broadcastmap.ts Mapbox 覆蓋地圖（cell/圍欄/pdot/波紋）+ 下鑽
  連動；(5) 模擬事件池兩發全鏈路動畫 + 重置 + show/hide 生命週期 + reduced-motion；(6) 全站驗收
  + 本文件。Task 3 兩個 Important（`.frail` 全域洩漏進漏斗 rail、tokens 清理誤傷 carbon `.fchip .n`
  等寬字）已修再驗；Task 5 一個 Important（動畫 t=0 未清手機/漏斗致「選中卡=新事件、手機/漏斗=舊
  事件」錯配，且切頁再切回會永久停舊事件）已修再驗（還原 renderPhone/renderFunnel 的 null 空狀態
  分支對齊 preview 第 344 行）。
- **驗收（誠實分野）**：三綠燈全過（tsc 0 / vitest 16 檔 61 tests / build ok）。純邏輯（funnel 轉換率/
  mock 契約：sev↔CH 對映、紅級雙漏斗、cellsLit 存在性、漏斗遞減）走 vitest；渲染/地圖/互動每個
  task 皆以獨立 headless Chrome + CDP（SwiftShader、勿加 --disable-gpu、.env 有 token 故地圖真渲染）
  逐項驗證；Task 6 全站整合 spec §10 實質 30/30（唯一 CDP FAIL 是主腳本對 Mapbox 重載頁 sleep 不足
  的時序假象——鍵盤 7→settings 慢速三路徑重測全正確、非缺陷）、**8 頁全站迴歸 console 零 JS 例外**。
  截圖 3 張（初始/下鑽/紅色警報頂格，SwiftShader 真實 app）存 scratch。demo 前建議真 Chrome 人工
  click-through 一輪（下鑽/演練兩發/tooltip/Ack 手感），carbon LIVE 需先起 PoC 後端。
- 設計事實與 schema/決策見 `docs/superpowers/specs/2026-07-07-alert-redesign-design.md`；實作計畫
  `docs/superpowers/plans/2026-07-07-alert-redesign.md`（6 tasks）；視覺/互動基準
  `docs/preview/preview-alert-redesign.html`（token 佔位 `__MAPBOX_TOKEN__`；本機測試副本
  `docs/preview/.preview-alert-test.html` 含真 token **已 gitignore、勿提交**）；逐 task review 摘要
  `.superpowers/sdd/progress.md`。
- **最終 whole-branch review（opus）＝Ready to merge**：零 Critical/Important；承載性接縫（t=0 空狀態、
  演練 timeline×cancelTimers/hide、Mapbox marker 坑、CSS scope 與 tokens 清理兩處補償、資料契約×mock、
  DEV-gate、既有頁零回歸）全數獨立覆核正確。新發現兩個 Minor 已於 `9397e2f` 修完：漏斗佔位
  `var(--ink40)`→`var(--ink-40)`（未定義變數落回近白）+ broadcastmap 加 `stop()` 切頁停圍欄呼吸
  interval（hide 呼叫、show 補 renderMap 對稱恢復）。其餘 Minor（KPI 測試斷言可收緊、renderer innerHTML
  未 escape 待 live provider 前補）triage=defer。
- **finishing 完成 + push**：使用者選「本地合併回 main」→ fast-forward 到 `7f6b437`、feature 分支已刪；
  合併後兩筆 follow-up（手機比例微調 + README 畫面展示）→ **push 到 origin**。本輪無後續排定 task。
  demo/競賽前建議真 Chrome 人工 click-through（下鑽/演練兩發/tooltip/Ack 手感）；carbon LIVE 需先起 PoC 後端。

**（以下為前一輪 Settings 頁，已完結）**

**系統設定頁（Settings）：SDD 8 tasks 全數逐 task review 通過 + 最終 whole-branch review (opus, Ready to merge) + 三項最終修復，使用者實機驗收通過，已合併回 main（fast-forward `b78e423`→`2474de9`、feature 分支已刪）並 push 到 origin。三綠燈 + CDP 全站驗收綠燈。README「畫面展示」已加系統設定頁截圖（`docs/screens/settings.png`）。本輪工作全部結束。**
- 定位：左側 rail 底部新增「系統設定」入口（第 8 個 screen，模組色中性銀灰 `#9FB0C0`、mode `doc`、鍵盤 `7`），
  承載全站前後端設定，分 7 分區（前端設定 + 六大功能模組）。核心價值是**框架先行**——schema 驅動的
  設定框架讓協作者**不碰 UI 程式碼**就能新增/刪除自己模組的設定項目；現在能確定的（policy 知識庫 +
  模型管理）做成完整互動 mock 當示範樣板，其餘四模組（twin/dispatch/epidemic/alert）為 disabled 佔位骨架。
- 真實程度：落地 localStorage（單一 key `imarine.settings.v1`）+ 有限生效——policy 地端/雲端切換、
  carbon API base、mapbox token、動效設定實際生效；其餘存而不用等後端。**只換讀取點，不動任何頁的操作邏輯**。
- **成果檔案**：`src/screens/settings/{index.ts,schema.ts,storage.ts,renderer.ts,settings.html,settings.css}` +
  `src/screens/settings/sections/{frontend,carbon,policy,twin,dispatch,epidemic,alert}.ts` 新增；
  接線改動（只換讀取點）：`src/shell/registry.ts`（第 8 筆 ScreenDef）、`src/shell/rail.ts`（spacer+hr+齒輪鈕）、
  `src/main.ts`（鍵盤 `7` + carbon base 讀取順序 settings→env）、`src/screens/policy/index.ts`（llmMode 初始化/
  回寫/subscribe 雙向同步）、`src/screens/epidemic/worldmap.ts`（mapbox token settings→env）、各頁 reduced-motion
  改讀共用 `prefersReduced()` helper（storage.ts）；測試新增 `tests/{settings-storage,settings-schema,settings-policy-preset}.test.ts`。
- **SDD 8 tasks（每個獨立 code review 皆 Spec 符合 + Quality Approved）**：(1) storage.ts + schema.ts（SettingField
  8 種 kind union / validateSections key 唯一性 throw）TDD；(2) shell 接入 + 7 分區導覽骨架 + settings.html/css；
  (3) renderer.ts（instant/explicit 語意）+ 前端設定 + 四佔位分區；(4) 有限生效接線（prefersReduced/進場動畫/
  mapbox/carbon base）；(5) 資料源總覽（carbon 真 /health 探測）+ carbon 分區（測試連線）；(6) policy 模型管理
  （供應商 Setup modal / 系統預設模型）+ llmMode 雙向同步；(7) policy 知識庫管理（多庫/KB modal/chunk/檢索策略
  progressive disclosure/rerank 導引）；(8) README 協作者指南 + 全站驗收 + 本文件收尾。
- **驗收（誠實分野）**：三綠燈全過（`tsc` 0 / `vitest` 14 檔 49 tests 全綠 / `build` ok）。純邏輯（storage
  round-trip / schema key 唯一性 / 預置資料契約）走 vitest；互動以獨立 headless Chrome（埠 9429、SwiftShader
  flags、勿加 `--disable-gpu`）+ 自寫 CDP 腳本逐項實機驗證，spec §10 全清單通過：rail 齒輪+鍵盤 `7`、`0-6` 迴歸、
  7 分區切換、instant/explicit 兩儲存語意 + 重載保留 + 捨棄還原、供應商 Setup 全流程（空值失敗→驗證→載模型→
  啟停→儲存轉已連線→系統預設 select 聯集→移除）、知識庫全流程（開庫/上傳假 indexing→available/刪文件/chunk
  儲存/hybrid 權重 slider/rerank 無模型導引跳轉/新增庫/刪庫/重置為預設）、llmMode 設定頁⇄policy 頁雙向同步 + 重載
  不失、mapbox 覆寫（settings 值壓過 .env）、reduced-motion 設定生效（epidemic 管線走同步終態分支）+
  prefers-reduced-motion 模擬、**8 頁全站迴歸 console 零錯誤**、settings 輸入框內打 `1`-`7` 不跳頁（既有 bail-out）。
  截圖 3 張（前端/policy Setup modal/KB modal，SwiftShader）存 scratch。demo 前建議真 Chrome 人工 click-through 一輪
  （切分區/開兩個 modal/拖 slider/切策略的手感）。
- **Task 8 全站驗收發現的視覺缺陷（未修，交 review 決策，見第 5 節）**：settings 頁內容**未包在 `.swrap` 版心**——
  其餘 7 個 screen 的 index.ts 都把內容包進 `<div class="swrap">`（`.swrap` 有 `padding-left:110px` 讓開固定
  rail），但 `settings/index.ts` 直接 `el.innerHTML = html.replace(...)` 無 `.swrap`（settings.css 註解誤以為
  「shell 已提供」）。實測：policy 左欄起於 x=151 已避開 rail（右緣 x=72），settings 的 `.sgrid`/`.subnav` 起於
  x=0 → 固定 rail 疊在左欄分區導覽上（垂直置中處的「沙盤推演/派工建議/疫情追溯/警報」列被 rail icon 遮住）。
  功能不受影響（CDP 94/94 全過、console 零錯誤、分區可點切），純視覺佔位錯誤。屬 Task 2（shell 接入）遺漏、
  逐 task review 未攔到，本 task 純文件+驗收依規約不自行修產品碼。最小修法：settings/index.ts 比照 carbon/
  policy/alert 把 header+sgrid 包進 `<div class="swrap">…</div>`（一行級），或於 settings.css 給 `#s-settings` 補
  `padding-left`。**建議在使用者實機驗收前先修此項。**
- 設計事實與 schema/決策見 `docs/superpowers/specs/2026-07-07-settings-page-design.md`（含 SettingField union、
  儲存語意、各分區規格、PolicyBackendSettings 資料契約、README 章節結構、驗收標準）；README 新增「協作者指南」章
  （新增/刪除設定欄位 + 讀取設定值 + mock→live + 前端頁面設計規範/PR 自查清單）作協作者 PR 檢查基準。
- **下一步**：最終 whole-branch review（opus/fable）→ 使用者實機驗收 → finishing（決定合併方式，比照
  policy/dispatch/epidemic 前例可能本地合併回 main、未 push）。詳見第 4 節。

**（以下為前一輪 Epidemic 改版，已於 2026-07-05 合併回 main 完成）**

**Epidemic 頁改版：SDD 8 tasks 全數完成並通過逐 task review + 最終 whole-branch review，已於 2026-07-05 合併回 main（commit `3a0a5f0`，本地，未 push）。分支 `epidemic-redesign`（自 main，baseline `f829e0b`）任務完結。**
- 定位：「疫情自動追溯」——進高雄港船隊總覽 → 下鑽單船；AIS 停靠序列 × WHO/疾管署/新聞疫情
  時序**時空交叉比對**（規則式評分依 WHO IHR，非 ML）→ 擴散預警 → 細胞簡訊。港邊人員視角、模組色玫紅。
- 使用者三大定案要求（全數落實）：**中性虛構船名**（不提任何真實具名事件/船/公司）、**無解釋性散文**
  （重點用數據/chip/色彩呈現）、**引導性配色**（常態壓灰、風險與命中發亮，視線帶「左欄最高風險
  → 中央命中 → 右欄簡訊」）。
- 版面：標頭 → 全寬自動化管線帶（爬情資→重建航跡→時空比對→規則評分→細胞簡訊）→ 三分割
  （左 0.72fr 進高雄船隊清單 / **中 2.9fr 放大為主要呈現** / 右 1fr 評分+情報+防護+簡訊）；
  中央上 **Mapbox 真實地圖**（深色 dark-v11，只收目的港為高雄的船、真實航線→高雄、疫區熱點、船位插值）
  + 下 Epi-Gantt 雙泳道（靠泊 × 通報 + 命中連接線），共用可拖曳時間游標。
- 四互動全做：點船下鑽、時間游標拖曳（船沿真實航線移動+命中脈衝）、管線進場動畫+點階段看來源、
  模擬偵測（池兩發：升級現有 NORDIC 88 41→68 + 新增 CORAL EXPRESS 85 紅級，池盡重置）。
- **成果檔案**：`src/screens/epidemic/{correlate.ts 新增,worldmap.ts 新增,swimlane.ts 新增,
  index.ts 重寫,epidemic.html 重寫,epidemic.css 新增}` + 刪 `route.ts` + `src/data/types.ts`
  （EpidemicSnapshot 改 fleet/pipeline/inflowPool 結構）+ `src/data/mock/epidemic.json`（全面改寫成
  六船皆進高雄，逐字轉錄自已驗收 preview）+ `tests/{epidemic-correlate.test.ts,epidemic-mock.test.ts}`
  新增 + `src/ui/tokens.css` 刪 epidemic 舊佔位段 + `package.json`（+mapbox-gl/@types）+ `.env.example`
  （+VITE_MAPBOX_TOKEN=）。
- **SDD 8 tasks（每個獨立 code review 皆 Spec ✅ + Quality Approved）**：(1) correlate.ts 規則式評分+
  時空命中 TDD；(2) 資料契約+mock 全面改寫+刪 route.ts 降過渡殼 TDD；(3) 三分割骨架+epidemic.css
  （#s-epidemic 前綴）+靜態渲染+tokens.css 清舊；(4) Mapbox 依賴+worldmap.ts+選中船地圖渲染；
  (5) swimlane.ts Epi-Gantt+點船下鑽全連動；(6) 時間游標拖曳/鍵盤+船沿航線插值+命中脈衝；
  (7) 管線進場動畫+點階段看來源+模擬偵測池兩發+show/hide 生命週期+reduced-motion；(8) 全站驗收+本文件。
- **驗收（誠實分野）**：三綠燈全過（tsc 0 / vitest 11 檔 40 tests 全綠 / build ok）。純邏輯（correlate/
  mock 契約）走 vitest TDD；地圖/互動每個 task 皆以獨立 headless Chrome + CDP（SwiftShader、勿加
  --disable-gpu；MCP 共用 profile 曾被別 session 污染故改獨立）逐項實機驗證；Task 8 全站整合驗收：
  7 頁迴歸全 active、epidemic Mapbox canvas+5 船+ring 72、下鑽 NORDIC 41、管線點階段 .pdetail 顯示、
  模擬三連擊（CORAL 85 置頂/NORDIC 68/重置）、reduced-motion 管線終態，全程 console 零錯誤；截圖存證。
  demo 前建議真 Chrome 人工 click-through 一輪（拖游標/切船/點管線/模擬偵測的手感）。
- **Mapbox token**：實作走 `.env` 的 `VITE_MAPBOX_TOKEN`（gitignored，本機已設）；範例頁
  `docs/preview/preview-epidemic-redesign.html` 的 token 已還原成佔位 `__MAPBOX_TOKEN__`（進版控無 token）；
  建議對 token 於 Mapbox 帳號設 URL 網域限制。**取捨：Mapbox 磚需連網，放棄純離線；demo 現場需備網路。**
- 設計事實與規則見 `docs/superpowers/specs/2026-07-05-epidemic-redesign-design.md`；實作計畫
  `docs/superpowers/plans/2026-07-05-epidemic-redesign.md`（8 tasks）；視覺/互動基準
  `docs/preview/preview-epidemic-redesign.html`；逐 task review 摘要 `.superpowers/sdd/progress.md`。
- **完結狀態**：最終 whole-branch review 通過 → 使用者實機驗收通過 → 已於 2026-07-05 本地合併回
  main（commit `3a0a5f0`，未 push，比照 dispatch/policy 前例）。分支任務完結。

**（以下為前一輪 Dispatch 改版，已完成）**

**Dispatch 頁改版：SDD 實作完成（7 tasks 全數逐 task review 通過），全站驗收綠燈，分支 `dispatch-redesign`（自 main，baseline `a43f249`）。待最終 whole-branch review + 使用者實機驗收 + 決定合併方式。**
- 動機：舊 dispatch mock 頁的核心假設與真實系統不符——ConvLSTM 對未來 90 分鐘輸出的是
  **單一預測**（全港區彙總：六級雨量分級 + 蒲福風級 + 10min 平均 + 陣風），無逐 10 分鐘序列、
  無空間網格；舊頁的「拖時間軸看熱區網格」與熱區 canvas（heat.ts）因此廢棄。
- 定案版面（視覺 companion 四方向比選 → D 混血 → v2/v3/v4 迭代，v5 手動更新鈕提案被否決退回
  v4）：hero 三塊（風險色大字塊 / 一句話結論 + 複合時間軸 slider / 更新進度環 10:00 自動倒數）
  + 七列作業燈號矩陣（ConvLSTM 寬欄含動作字 + CWA +3h/+6h 窄欄純色，列點擊原位展開規則依據含
  官方/慣例徽章）+ 右欄派工指令卡（含綁解纜「加派」型綠卡）。三情境 stable/rain/typhoon。
- 成果檔案：`src/screens/dispatch/{index.ts 重寫,dispatch.html 重寫,dispatch.css 新增,
  conclusion.ts 新增}` + 刪 `heat.ts` + `src/data/types.ts`（DispatchSnapshot 改三情境結構）
  + `src/data/mock/dispatch.json`（全面改寫成三情境，逐字轉錄自已驗收 preview）+
  `tests/{dispatch-conclusion.test.ts,dispatch-mock.test.ts}` 新增（+`mock.test.ts` 一個
  pre-existing 案例隨契約改版更新）+ `src/ui/tokens.css`（刪舊派工段）。
- **SDD 7 tasks（每個獨立 code review 皆 Spec ✅ + Quality Approved）**：
  (1) conclusion.ts parseConclusion（{{stop:}}→<em>、{{add:}}→<u>）TDD；
  (2) 資料契約三情境 + mock JSON 逐字轉錄 + 刪 heat.ts + 降過渡殼 TDD；
  (3) 版面骨架 + dispatch.css（自 preview 逐條轉錄、全 #s-dispatch 前綴）+ 靜態渲染 + tokens.css 清舊；
  (4) 情境切換 + 規則展開（單列互斥）；(5) 時間軸游標（三段泡泡 + 欄標頭連動 + 鍵盤隔離）；
  (6) 模型更新倒數（10:00 自動 + 推論動畫 + show/hide 生命週期 + reduced-motion + DEV-only 測試鉤）；
  (7) 全站驗收 + 本文件收尾。
- **驗收（誠實分野）**：三綠燈全過（tsc 0 / vitest 9 檔 29 tests 全綠 / build ok，DEV 鉤 grep dist=0）。
  控制器每個互動 task 皆以 headless Chrome + CDP 實機逐項驗證（Task3 靜態 8 斷言、Task4 情境+規則
  21、Task5 時間軸+鍵盤 12、Task6 倒數+生命週期+RM 17、Task7 七頁全站+整合+demo 動線 18），
  合計 76 斷言全 PASS、console 全程零錯誤；三情境（含 typhoon 玫紅態規則展開）截圖存證於 scratch。
  demo 前建議真 Chrome 再人工 click-through 一輪（拖時間軸/切情境/點列展開的手感）。
- 關鍵設計事實與規則庫依據見 `docs/superpowers/specs/2026-07-05-dispatch-redesign-design.md`
  （決策表 / 資料契約 DispatchScenario / 規則庫 15 條含官方條號出處 / 三情境劇本 / 互動規格 /
  驗收標準）；實作計畫 `docs/superpowers/plans/2026-07-05-dispatch-redesign.md`（7 tasks）；
  視覺/互動基準 `docs/preview/preview-dispatch-redesign.html`（36 CDP 斷言已驗收）。
- **下一步**：最終 whole-branch review（opus）→ 使用者實機驗收 → finishing（決定合併方式，
  比照 policy 前例可能本地合併回 main、未 push）。

**（以下為 Dispatch 改版 brainstorming 歷程記錄，實作見上）**
- 兩份 subagent 網路調研沉澱進 spec：(1) 港口作業天氣規範（法定強風 10 m/s 勞動部函釋 0042784、
  高雄港風災防救要點 7 級全港停工/5 級浮筒淨空/警戒加纜 5/7 條/危險品船出港、起重機 30 m/s
  錨定線、穀物見雨即停 WWD 慣例、油品雷電紅線 ISGOTT Ch.16、CWA 雨量分級）；(2) UI/UX 參考
  （StormGeo per-operation 紅黃綠矩陣、Apple Weather 一句話結論、Yahoo!天気雙資料源同軸縫合）。
- preview 迭代修正一個真問題：時間軸 `setPointerCapture` 對合成 pointer 事件拋 NotFoundError，
  已加 try/catch 防禦（實作 Task 5 帶入）。

**（以下為前一輪已完成工作）**

**Policy 頁改版：實作完成並已合併回 main（本地，未 push）。**
- SDD 執行 8 個 task（generate.ts TDD → 契約+mock JSON TDD → components.ts source optional →
  三欄骨架+版型+gbar → 對話串 → 生成動畫+情報流入 → 綜合對話知識庫 → 全站驗收），每 task 皆
  獨立 code review（Approved 或 Needs-fixes→修正 Approved）；最終 whole-branch review（opus）
  = Ready to merge（零 Critical/Important）；複審修正波 4 修正（hide() 動畫凍結、@keyframes
  pulse 改名 pgpulse 防跨頁衝突、gbar-note 去重、cite 對映測試硬化）。
- 成果：`src/screens/policy/{index.ts,policy.html,policy.css}` 重寫 + `generate.ts` 新增 +
  `src/data/types.ts` PolicySnapshot 改 briefs/inflow/globalQa discriminated union +
  `src/data/mock/policy.json` 全面改寫（9 情報 + globalQa）+ `src/ui/components.ts` source 改
  optional + `tests/policy-generate.test.ts`/`policy-mock.test.ts` 新增。視覺/互動基準為已核可
  的 `docs/preview/preview-policy-redesign.html`（v7）。
- 合併：使用者選「本地合併回 main」，fast-forward 到 580f3e4，feature 分支 policy-redesign 已刪，
  **未 push**（依專案慣例）。
- **驗收狀態（誠實分野）**：policy 全部測試綠（policy-generate 2/2、policy-mock 4/4）、tsc 0、
  build ok；全站七頁導覽 console 乾淨；綜合對話模式已用 Playwright 實機截圖確認。互動路徑
  （點船式互動除外，policy 無 3D）如點 chip 生成/追問/情報流入/搜尋/reduced-motion 由 SDD 過程
  中 headless CDP 逐項驗證，demo 前建議真 Chrome 再人工 click-through 一輪。
- **合併後測試殘留（非 policy 缺陷，見第 5 節）**：合併後全套重跑時 `tests/twin-provider.test.ts`
  的「snapshot 映射…」逾時（Test timed out in 5000ms，非斷言失敗）——twin 舊測試動態載入 4.6MB
  航跡在機器負載下超過 vitest 預設 5s；本分支未動任何 twin 檔。屬 pre-existing 環境 flaky。

**（以下為 Policy 改版 brainstorming 歷程記錄）**

**Policy 頁改版 brainstorming（已完成，實作見上）：設計定案，示範介面 v7 使用者驗收通過。**
- 方向（全部經使用者逐項確認）：政策情報中心＝ NotebookLM 三欄骨架 × Perplexity「看得見 AI
  在工作」生成過程。三種情境進同一個收件匣敘事：突發事件決策建議（主秀：紅海航線中斷升級）、
  新政策分析（現有 IMO NZF 五段報告原樣沿用）、routine 日報（07:00 自動生成晨報）；LLM 接口
  切換（抽象命名「地端部署／雲端 API」，只影響下一次生成）。**純 mock**，不接真 LLM。
- Layout 經視覺 companion 三輪迭代：初版三欄被使用者評「太繁雜」→ 減負（無過濾 chips、meta
  單行、來源勾選框 hover 才浮現、突發不做獨立嚴重度橫幅）→ 定案「三欄・極簡左欄」：左欄純收
  件匣（色點＋標題）、中欄報告（三類專屬版型 + 生成步驟動畫）、右欄 Grounding 儀表＋來源清單
  （勾選與引用合一，iMarine 五類徽章對齊報告書 v6）。
- spec：`docs/superpowers/specs/2026-07-04-policy-redesign-design.md`（決策紀錄表、互動規格、
  PolicyBrief discriminated union 資料契約、7 條 mock briefs 清單、檔案結構、驗收標準）。
- 互動示範：`docs/preview/preview-policy-redesign.html`（自含 Kit，比照 twin preview 前例組裝；
  headless Chromium 驗證 console 零錯誤 + 自動互動斷言全 PASS：條目切換、日報建議關注
  goto、LLM 切換、來源取消勾選後統計遞減、生成動畫完成/取消路徑）。
- **mockup 驗收輪修訂（使用者回饋後定案）**：(1) 中欄改為 NotebookLM 純血對話串——報告變成
  串中第一張「結構化產出卡」，下方建議追問 chips（每條 brief 帶 qa 預錄劇本）+ 輸入列；追問
  → 思考氣泡兩拍 → 回答氣泡（cite 連動右欄、footer 帶模型/引用數）；自由輸入回覆誠實示範
  說明；重新生成的四步驟動畫改在產出卡內原位播放、Q&A 氣泡保留。(2) 移除標題列技術徽章
  `.lg-chip` 與 mockup 專用 `.mocknote` 浮籤。spec 已同步（§2 決策表/§3 版面/§4.6/§6 qa 契約/
  §10 驗收）。v2 斷言 19 項全 PASS；headless 截圖驗證需 SwiftShader flags（`--use-gl=angle
  --use-angle=swiftshader --run-all-compositor-stages-before-draw`，否則玻璃層合成不出來——
  純 DOM 斷言不受影響）。
- **v3 修訂（使用者回饋第二輪）**：(1) 標題列 MOCK 資料源 chip 也移除——本頁不顯示 srcChip
  （使用者定案的頁面特例），標題列只剩 eyebrow/標題/LLM 切換器。(2) 新增「模擬情報流入」：
  進頁 ~9 秒自動插入第 8 條突發情報（巴拿馬運河配額削減，與紅海構成雙節點受限敘事）——頂部
  滑入 + 未讀圓點脈動 + toast「偵測到新事件」，不搶走目前選中，點開未讀消失；收件匣「怎麼來」
  的口徑（突發=異常偵測自動立項/政策=法規公告監測/日報=07:00 排程）寫入 spec §4.7。
  v3 斷言 11 項全 PASS、console 乾淨；spec 已同步（§2/§3/§4.7/§6 表加第 0 條/§10）。
- **v4 修訂（使用者回饋第三輪）**：(1) 收件匣標題列加「模擬偵測」按鈕——流入池兩條（巴拿馬
  → 馬六甲碰撞管制）依序流入、池用畢再點擊即重置循環，demo 可無限重複；~9 秒自動流入僅在
  未手動觸發過時執行。(2) 新增 NotebookLM 式「綜合對話」：收件匣頂部固定入口（漸層點 +
  分隔線）→ 知識庫模式——meta 顯示情報/來源/勾選統計、總覽卡（五類分佈）、右欄變全情報
  來源聯集（名稱去重重編號、勾選跨切換保留、流入自動擴充且不重置對話串）、Grounding 儀表
  顯全情報平均；綜合提問劇本 2 組，引用以 {{c:名稱}} 佔位、送出當下解析成聯集編號。
  「重新生成」於知識庫模式隱藏。v4 斷言 21 項全 PASS、console 乾淨；spec 已同步（§2/§4.7
  改寫/§4.8 新增/§6 流入池/§10）。
- **v5 修訂（使用者回饋第四輪：綜合對話來源平面清單太長難找）**：來源聯集改依 iMarine
  五類**分組摺疊**——群組標頭（三態群組勾選框 + 展開箭頭 + 類名 + 勾選數/總數）預設全部
  收合（24 筆 → 5 列）、頂部搜尋框（過濾即自動展開命中群組）、cite 點擊自動展開目標群組
  再捲動、hover 收合中來源改高亮群組標頭；一般條目模式（3-7 筆）維持平面清單。v5 斷言
  14 項全 PASS、console 乾淨；spec §4.8/§10 已同步。
- **v6 修訂（使用者回饋第五輪：Grounding 環形儀表太搶眼）**：移除右欄 `.lg-gauge` 儀表卡，
  改為中欄 meta 行下方的**窄橫向 bar**（GROUNDING 小標 + 180px 漸層細軌 + % + note，切換
  條目 0→值 過場、reduced-motion 直設）；meta 行去掉重複的「Grounding g%」字段；右欄整欄
  讓給來源清單。綜合對話模式 bar 顯全情報平均。v6 斷言全 PASS、console 乾淨；spec
  （§3 版面圖/§4.1/§4.8/§6 註解）已同步。
- **v7 修訂（使用者定案）**：移除中欄 meta 統計行（模型/時間/檢索/閱讀/引用那串字）——標頭
  只剩標題 + 重新生成鈕 + Grounding bar；模型/引用資訊只在回答 footer、toast 與生成步驟
  計數出現。斷言全 PASS、console 乾淨；spec 全文同步（決策表/版面圖/§4.2-4.4/§4.8/§10）。
- **mockup 迭代至 v7 使用者驗收通過。**
- **實作計畫已寫好**：`docs/superpowers/plans/2026-07-05-policy-redesign.md`（8 tasks：
  generate.ts TDD → 契約+mock JSON TDD → components.ts source optional → 三欄骨架+版型 →
  對話串 → 生成動畫+情報流入 → 綜合對話 → 全站驗收；每 task 檢查點由使用者 commit）。
- **Task 4 完成**（分支 `policy-redesign`）：重寫 `policy.html`/新建 `policy.css`/重寫
  `index.ts`——三欄骨架（收件匣/報告對話串/來源清單）+ 三類版型（突發雙案例卡、政策五段、
  日報四條+建議關注跳轉）+ Grounding 窄 bar + cite 連動 + 來源勾選即時灰列。CSS 遷移逐條對照
  brief 清單刪重複/前綴 `#s-policy`；過程中撈出一個真實 bug——tokens.css 既有的孿生模組
  `.gbar{position:absolute;...}`（未加前綴）會外漏污染同名 policy `.gbar`，把 Grounding bar
  拉出文件流疊到報告內文中間，已於 `#s-policy .gbar` 顯式覆寫 position/top/bottom/opacity/
  border-radius 修正，headless 截圖驗證前後對照確認。`npx tsc --noEmit` 0 錯、
  `npx vitest run` 21 PASS、`npm run build` 成功；MCP 內建瀏覽器工具（chrome-devtools/
  playwright）皆回報 profile 被鎖（多個並行 session 佔用），改用獨立 headless Chrome
  （`--remote-debugging-port` + 專屬 user-data-dir）自寫 CDP 腳本跑完 brief 驗收清單
  1-6 全數逐項驗證含互動（切換條目/勾選來源/cite hover-click/LLM 切換 toast），
  console 全程乾淨。
- **Task 5 完成**（分支 `policy-redesign`）：`index.ts` 接上追問互動——`renderChips`/
  `scrollThread`/`ask`/`currentQa`/`sendFree` + `cancelTimers()`/`answering`/`generating`
  狀態；chip 點擊/自由輸入 → 使用者氣泡 → 兩拍思考氣泡（檢索…→綜合回答與 Grounding
  驗證…）→ 回答氣泡（cite 連動右欄、footer 模型/時間/引用數）；chip 用掉即消失並依
  brief id 記憶（切條目重置對話串但保留記憶）；回答/生成互斥不可重入；切條目或切頁
  `cancelTimers()` 取消進行中 timeline（不洩漏回答到別條）；reduced-motion 跳過思考氣泡。
  僅動 `index.ts`；`npx tsc --noEmit` 0 錯、`npx vitest run` 21 PASS、`npm run build` 成功；
  MCP 內建瀏覽器（chrome-devtools/playwright）profile 仍被鎖，沿用 Task 4 手法改用獨立
  headless Chrome（`--remote-debugging-port` + 專屬 user-data-dir）+ 自寫 CDP 腳本（Node
  + `ws`）以真實時間流逝逐項驗證 brief 驗收清單 1-5 全數通過（含不可重入、切條目取消、
  reduced-motion 分支），console 全程乾淨。Task 6（生成動畫+情報流入）待下一輪。
- **Task 6 完成**（分支 `policy-redesign`）：`index.ts` 接上「重新生成」四步驟動畫與「模擬
  偵測」情報流入——`STEPMS`/`stepHtml`/`regenerate()` 在 `#reportBody` 內原位播放（解讀議題
  →檢索→閱讀來源逐一輪播勾選來源名→綜合驗證），完成後段落 `--gd` stagger 進場 + toast，
  reduced-motion 直通結果；受 `generating||answering||curId==='global'` 互斥保護，`model`
  捕捉觸發當下的 LLM 接口。`flowIn()`/`flowIdx`/`autoFlowArmed` 讓流入池（巴拿馬→馬六甲）
  依序滑入收件匣頂部、標未讀+一次性滑入動畫，不搶目前選中；池用畢下一擊重置並重新流入
  （若移除項含目前選中則退回第一條）；`updateAfterInflow()` 本 task 為 no-op，留給 Task 7
  接 global 聯集同步。`Screen.show()` 武裝 9 秒自動流入，僅在 `flowIdx===0` 且本頁 `.active`
  時觸發（離開頁面/被搶先手動觸發皆不誤跳 toast）。僅動 `index.ts`；`npx tsc --noEmit` 0 錯、
  `npx vitest run` 21 PASS、`npm run build` 成功；MCP 瀏覽器 profile 仍被鎖，沿用獨立 headless
  Chrome（`--remote-debugging-port` + 專屬 user-data-dir，SwiftShader flags 供截圖）+ 自寫
  CDP 腳本以真實時間流逝跑完 brief 驗收清單 1-7（含地端/雲端計時、取消勾選來源後計數變化、
  生成中切條目/切頁的取消語意、模擬偵測三次循環、9 秒自動流入與「先手動觸發則不自動」互斥、
  停在 hero 頁不跳 policy toast），console 全程乾淨；三張截圖存證（步驟動畫中/完成 stagger+
  toast/模擬流入雙 toast + 未讀點）。
- **Task 7 完成（最後一個功能 task，分支 `policy-redesign`）**：`index.ts` 接上「綜合對話」
  知識庫模式——`buildUnion()`（跨 briefs 來源聯集、名稱去重重編號、`globalChecked` 跨切換
  保留勾選）、`resolveTokens()`（`{{c:名稱}}` → 送出當下解析成聯集編號 cite span）、
  `renderUnionSources()`（五類分組摺疊、三態群組勾選用 `indeterminate` property、搜尋自動
  展開命中群組並隱藏無命中群組、搜尋框重繪後還原焦點與游標）；`select('global')` 分支接在
  `select()` 開頭（`cancelTimers()` 之後）、隱藏 `genBtn`、`thread.innerHTML` 無條件寫入知識
  庫總覽卡；`currentQa()`/qchips 委派/`updateAfterInflow()`/`bindCites()` 均擴充 global 分支
  （收合群組時 hover 高亮標頭、點擊自動展開+捲動）。僅動 `index.ts`；`npx tsc --noEmit` 0
  錯、`npx vitest run` 21 PASS、`npm run build` 成功；MCP 瀏覽器 profile 仍被鎖，沿用獨立
  headless Chrome（`--remote-debugging-port` + 專屬 user-data-dir）+ 自寫 CDP 腳本跑完 brief
  驗收清單 1-7（含群組全選/半選/清空、搜尋過濾、cite hover/click 收合展開、模擬偵測不重置
  對話串、勾選與 chip 記憶跨切換保留、切回一般條目 genBtn 恢復），另補一組針對性測試驗證
  Task 5 已知邊界情況——條目回答思考氣泡進行中切到「綜合對話」，`thread.innerHTML` 完整覆蓋
  無殘留思考氣泡、且原 timeline 被 `cancelTimers()` 真正取消不會延遲洩漏回答氣泡；
  console 全程乾淨。**六大功能 task（4-7）全數完成，Policy 頁改版剩 Task 8 全站驗收。**
- **Task 8 完成（全站驗收 + 文件收尾，分支 `policy-redesign`）：Policy 頁改版 8 個 task 全部完成。**
  未改動任何程式碼，純驗收：
  - **三綠燈**：`npx tsc --noEmit` 0 errors；`npx vitest run` 7 個測試檔 21 tests 全綠；
    `npm run build` 成功（173 modules，3.67s，既有 chunk-size 警告與本次無關）。
  - **spec §10 逐項驗收（1-9）**：MCP 瀏覽器（chrome-devtools/playwright）profile 仍被鎖，沿用
    Task 4-7 手法——獨立 headless Chrome（`--remote-debugging-port=9455` + 專屬 user-data-dir +
    SwiftShader flags）+ 四支自寫 CDP 腳本（Node + `ws`），共 106 項斷言全數通過：
    (1) 三條主秀劇本迴歸——紅海 4 區塊+雙案例卡、重新生成四步動畫（地端 7.8s 內完成含前置
    delay、雲端更快）+ stagger + toast；NZF 五段文案 + cite hover/click 連動右欄；07-04 晨報
    建議關注 goto → 正確跳轉 NZF。(2) LLM 切換：chip 互斥、toast、雲端/地端生成與回答計時差異、
    切換後不覆寫已顯示回答的 footer 模型名。(3) 來源勾選：checkbox 預設 `opacity:0`（hover
    才浮現，CSS 層級，不影響功能）、取消勾選→灰列「未參與」、重新生成閱讀計數隨勾選數變化。
    (4) 追問對話：chip→使用者氣泡→兩拍思考氣泡→回答氣泡（cite+footer 模型/時間/引用數）、
    chip 用畢跨切換記憶、自由輸入誠實示範說明、不可重入、生成/回答中切條目正確取消不洩漏。
    (5) 模擬情報流入：**首次全流程跑在單一長壽命 session 內時，因中途各項生成/回答動畫耗時
    加總已超過 9 秒，9 秒自動流入會提前於手動點擊插入，導致池計數表面「錯位」**——另補一支
    獨立腳本用全新分頁乾淨重測，確認：模擬偵測 3 連擊＝巴拿馬→馬六甲→池用盡重置回收（正確
    無誤，含未讀點/toast/不搶選中）、9 秒閒置自動流入（僅觸發一次）、離開頁面 9 秒內不跳
    policy toast 且收件匣不變——12/12 全通過，證實(1)的「錯位」是測試手法問題而非程式缺陷。
    (6) 綜合對話：知識庫模式（genBtn 隱藏/總覽卡/聯集去重編號/平均 Grounding）、五類分組摺疊
    三態勾選、搜尋過濾自動展開、跨情報 chip 回答 cite 正確映射聯集編號、收合群組 cite 點擊
    自動展開+捲動/hover 高亮群組標頭、流入時聯集同步擴充且對話串不重置、切回一般條目
    genBtn 恢復、勾選狀態跨切換保留。(7) 全部 8 筆收件匣入口（7 briefs + 綜合對話）逐一點擊
    右欄同步、console 全程零錯誤。
  - **鍵盤導覽迴歸**：`#qinput` focus 後以 CDP `Input.dispatchKeyEvent` 送出真實鍵盤事件輸入
    `1`-`6`，六碼正確落入欄位且 `location.hash` 全程未變；對照組確認同碼在非輸入框情境下
    仍正常觸發全站導覽（`main.ts` 既有的 `INPUT/TEXTAREA/SELECT/isContentEditable` bail-out
    確認涵蓋本頁新輸入框，無需改動）。
  - **`prefers-reduced-motion: reduce` 驗證**（CDP `Emulation.setEmulatedMedia`）：13 項全過——
    選條目無淡入即完整顯示、重新生成無四步動畫直接出結果+toast、追問無思考氣泡直接出答案、
    模擬流入條目無 slidein class 直接出現（未讀點仍標示，脈動效果屬 CSS 動畫由 media query
    抑制，class 層級無法量測但已確認邏輯路徑正確跳過）、Grounding bar 兩種模式皆直接設值非
    0%，內容皆完整非空白。
  - **7 頁全站迴歸**：hero→carbon（PoC 後端剛好在線，LIVE 資料）→policy→twin（原生 WebGL 3D
    場景截圖確認真實渲染，非空白/未拋錯）→dispatch→epidemic→alert→回 hero，全程 `.screen.active`
    正確切換、console 零新增錯誤。
  - **殘留/未盡事項**：無阻斷性殘留；驗收過程發現的「模擬流入計數錯位」純屬第一支驗收腳本的
    測試手法瑕疵（沿用同一活頁跑滿全部項目導致背景 9 秒計時器提前觸發），已用獨立分頁重測
    排除疑慮，不影響任何交付程式碼。完整逐項證據（含截圖）見
    `.superpowers/sdd/task-8-report.md`（scratch，未進版控）。
  - **Policy 頁改版 8 個 task（TDD generate.ts → 契約+mock JSON → components.ts 微調 → 三欄
    骨架+版型 → 對話串 → 生成動畫+情報流入 → 綜合對話 → 全站驗收）全部完成，分支
    `policy-redesign` 待使用者實機驗收 + 決定整支複審/合併方式。**

**（以下為已完成的前一輪工作）**

**Twin 頁原生化改版：10 個 task 全部完成，全站驗收通過。**
- 動機：原本 iframe 嵌 LiDAR 有兩個根本問題——demo 要多起一個 server（埠 5174）、
  LiDAR 自帶戰情室 UI 與本 repo 四張沙盤浮動面板堆疊打架。
- 定案方向（全部經使用者逐項確認）：LiDAR 引擎+場景+資料**整包搬進本 repo 原生化**
  （方案 A，比照 Carbon 搬入先例，上游唯讀）；UI 重做為**雙分頁戰情室**（即時回放＝
  過去 24hr 真實 AIS 回放／未來推演＝沙盤 mock），**只有右 rail**（無左 rail、無標頭）、
  一條底部時間軸（語意隨分頁切換）、船型篩選兩分頁共用；納入案例調研三功能：航跡密度
  圖層（學 MPA 熱圖）、點船資訊 chip（學 Corpus Christi OPTICS）、視角預設運鏡。
- 資料盤點：LiDAR 的 423MB `models/` 是離線管線素材**不搬**；runtime 只需 ~8.5MB
  （4.6MB 單日航跡 443 艘×24.2hr + 2.1MB 航照底圖 + 1.3MB 船模點雲 + 零頭）。
- 產出：spec `docs/superpowers/specs/2026-07-04-twin-native-redesign-design.md`（含檔案
  結構、資料清單、分頁行為表、三功能規格、生命週期、驗收標準）；互動 mockup
  `docs/preview/preview-twin-redesign.html`（自含 Kit，v4，兩分頁/篩選/密度/點船/視角
  全部可操作，headless Chromium 驗證 console 乾淨）；分支 `twin-native-redesign`
  （baseline commit `6355e90`）。
- **Task 1-9（實作）逐一完成並通過 review**（commits `0aa9ffc`..`c3d2c12`）：
  - Task 1：`npm install three`/`three-mesh-bvh`/`troika-three-text` 三件套 + `@types/three`；
    `tsconfig.json` 補 `lib`/`esModuleInterop`；`cp -R ~/Desktop/LiDAR/src src/twin-engine`
    （23 檔，`diff -rq` 確認逐位元組相同的唯讀 vendored 副本）。
  - Task 2：場景/geo/time/data/palette 等模組 + `berths.ts`（執行時發現的傳遞依賴，補入
    複製清單）+ ~8.5MB runtime 資料搬進 `src/screens/twin/data/`。
  - Task 3：`scene-init.ts` 忠實改包上游 `main.ts`（404 行邏輯），新增
    `flyTo`/`setDensity`/`pickShipAt`/`inPortAt`/`categoryCounts` 等握把 API，TDD 補 6 個
    單元測試。
  - Task 4：新版面骨架 `twin.html`/`twin.css`（`#s-twin` scope，無手寫 backdrop-filter）+
    `index.ts` 重寫生命週期（mount/show/hide）+ viewbar（視角預設運鏡）+ tabsbar（雙分頁）；
    舊 iframe／連線探測／`OFFLINE` fallback／`setTwinOffset` 全數刪除。
  - Task 5：右 rail 篩選（10 列船型）／密度圖層開關／在港趨勢 SVG（`panels.ts`）。
  - Task 6：底部時間軸 `timeline.ts`（回放 scrub、未來推演 NOW+分鐘、播放/倍速，分頁語意
    切換 + 凍結時停用 rAF）。
  - Task 7：未來推演右 rail 面板——情境切換（4 顆按鈕 + toast）、泊位甘特（資料驅動選窗，
    本快照選中最忙連續 8 泊位 63-70）、KPI 在港船數彈簧動畫；Task 7 review 後一次修正
    `#gantt{position:relative}`（commit `6527e0a`，現在線對齊問題）。
  - Task 8：點船資訊 chip——`pickShipAt` 點擊命中 → 固定骨架 `innerHTML` + 動態欄位改
    `textContent`（XSS 安全），四種收起觸發（空點/scrub/切分頁/切視角）齊全。
  - Task 9：twin provider 改寫為原生資料版（`source:'live'`，讀 vendored JSON，無 `url`
    欄位、無任何 HTTP 呼叫；4.6MB 航跡資料只在 `snapshot()` 內動態 `import()`，build chunk
    驗證證實懶載入不進 58KB 開機 entry）；連帶清理 `types.ts`/`screens/types.ts` 過期的
    iframe/`url` 字眼、`.env.example` 移除 `VITE_TWIN_URL`。
  - 三項案例調研功能全數落地並個別驗證：航跡密度圖層（Task 5）、點船資訊 chip（Task 8）、
    視角預設運鏡（Task 3+4）。全程 `npx tsc --noEmit` 0 errors、`npx vitest run` 由 10/10
    累加到 16/16、`npm run build` 皆成功；每個 task 皆有獨立 code review（Approved 或
    Needs-fixes→已修正 Approved），Minor 級發現彙整於 `.superpowers/sdd/progress.md`
    留給下一輪 whole-branch review。
- **Task 10（樣式殘留清理 + 文件更新 + 全站驗收）完成**：
  - `src/ui/tokens.css` 移除孿生區段已死的 `.float-tl`/`.float-r` 規則（含窄螢幕 media query
    內的 `.float-r{display:none;}`）——twin.css 現已有自己 scope 過的版面選擇器，這兩組舊
    浮動面板選擇器（iframe 時代遺留）確認全站無其他引用。
  - `README.md` 全文掃描：`.env` 現只剩一個變數（`VITE_CARBON_API`）、刪除
    `VITE_TWIN_URL`/iframe 表列與說明、「Live Demo 前置作業」改為僅 carbon 需要，twin
    明確標示原生內建、`npm run dev` 即可、無需任何前置服務。
  - `CLAUDE.md` §2 相鄰工作區表格：數位孿生列註明引擎+場景已 vendored 進
    `src/twin-engine/` 與 `src/screens/twin/`，上游 LiDAR repo 僅供資產再生成；§3 twin 列
    狀態改為「live/native（自繪，無外部依賴）」，取代舊的「待嵌入」。
  - 全站驗收（對照 spec §13）：`tsc`/`vitest`/`build` 三綠燈；埠 5174 確認無需求（twin 不
    再發出任何對外連線）；Chromium headless 驗證 twin 頁 3D 直繪 + 右 rail + 時間軸，以及
    全七頁（hero/carbon/policy/twin/dispatch/epidemic/alert）逐一到達、console 零錯誤。
  - 完整報告：`.superpowers/sdd/task-1-report.md` ~ `task-10-report.md`（scratch，未進版控）；
    `.superpowers/sdd/progress.md` 有逐 task review 摘要。
- **最終 whole-branch review（opus）完成：Ready to merge**——零 Critical/Important 跨 task
  缺陷；承載性接縫（modeApi/timeline/panels/chip 接線順序、共用 filter 兩分頁傳播、凍結
  語意、`engine.start()` 冪等、懶載入邊界、WebGL throw 由 router 錯誤路徑復原）全數確認
  正確。累積 Minor 全部判 defer-acceptable，詳見 `.superpowers/sdd/progress.md` 末段。
- **已合併回 `main`（fast-forward 到 `ce19963`，12 個 commit）並 push 到 origin**
  （`github.com/NCHU-ICTALab/iMarine-FrontEnd`）；feature 分支 `twin-native-redesign` 已刪除；
  合併結果 `tsc` 0 / `vitest` 16/16 綠燈；使用者實機驗收通過。
- **畫面展示入 README**：`docs/screens/twin.png`（原生 3D 數位孿生，SwiftShader 實拍）+
  `docs/screens/carbon.png`（carbon LIVE 真實資料，PoC 後端 8000 在跑時擷取），README
  新增「畫面展示」段引用。
- 殘留（非阻斷，見第 5 節）：opus 建議的一行 polish（`panels.ts`/`timeline.ts` 的
  `Math.round(min%60)` 快速播放可能閃「HH:60」，改 `Math.floor`）尚未動，待使用者指示；
  互動路徑（點船/拖曳/分頁轉場/運鏡/reduced-motion）demo 前建議真 Chrome 人工 click-through。
- twin 頁原生化改版至此全部完成，無其他排定 task。

**（以下為既有進度記錄）**

**全站複審最終修正波（8 項，接續 Task 12 之後）完成。**
- Fix 1（重要，真缺陷）：`src/main.ts` 全域 `keydown` 導覽鍵（`0`/`1-6`/`Enter`）先前未檢查
  `e.target`，在 carbon 的單筆發行/上架等 modal 輸入框（`#one-ship`/`#one-gfi`/`#one-mj`/
  `#list-price` 等）打數字會誤觸導覽、跳離畫面。修正：handler 開頭加兩道 bail-out——
  `e.metaKey/ctrlKey/altKey` 直接略過（不劫持瀏覽器快捷鍵）、`e.target` 為 `INPUT`/
  `TEXTAREA`/`SELECT`/`isContentEditable` 也直接略過，其餘導覽邏輯不動。
- Fix 2/3（M10/M11）：`src/screens/carbon/carbon.css`——`.wrap` 頂部 padding 由 PoC 舊 topbar
  時代遺留的 `104px` 改回 `24px`（shell 標題列取代 topbar 後不需再讓出空間），側/底距不動；
  刪除 `#s-carbon .eyebrow .dot{background:#fff}` 這條蓋掉 shell 金色模組色的洩漏 PoC 樣式，
  改吃 `tokens.css` 的 `.eyebrow .dot{background:var(--mc)}` + `screenHeader` 給的
  `--mc:#E9BC63`，header 圓點現正確顯示金色。副作用（非缺陷）：碳權頁內部沒有帶
  `--mc` 的次要 eyebrow（工作台工具列「SU 資產」、稽核表頭、drawer、各 modal 標頭）原本也被同一條
  規則強制染白，移除後改吃 shell 預設青綠色 `#35E0A6`，非本次修正範圍、维持現狀。
- Fix 4（M3）：`src/shell/router.ts` 的 `go()` 首次掛載區塊——`await def.load()` /
  `await mod.default.mount()` 原本沒有 try/catch，動態 import 失敗或 mount() 拋錯會留下
  孤兒 `<section>`（未快取、未移除）且 `currentId` 卡在半吊子狀態。修正：兩個 await 包進
  try/catch，catch 內 `section.remove()` + `currentId` 復原成前一頁 + `return`；與既有的
  supersede-abort（`myToken !== token`）邏輯並存但語意分開，happy path 不動。
- Fix 5（M7）：同檔 `show()`/`applyMode` 呼叫處加一行註解，明記兩者必須同步（中間不可插入
  `await`）——hero 的 `show()` 用 `queueMicrotask` 覆寫模式即依賴此順序，純文件補充、無行為改動。
- Fix 6（M2）：`index.html` `<head>` 加 `<link rel="icon" href="data:,">`，消除瀏覽器對
  `/favicon.ico` 的預設請求（先前 Task 12 驗收記錄的「僅預期內的 favicon 404」自此不再出現）。
- Fix 7（lg.d.ts）：`src/ui/lg.d.ts` 的 `LiquidGlass.behaviors` 型別原本只有 `stats`，補齊
  Kit 實際存在的 `tabs?`/`slider?`/`switchTension?`/`dock?`（對照 `liquid-glass.js` 第 1561
  行的 `behaviors` 物件），純型別補充，各 screen 既有的 `as {...}` cast 不受影響。
- Fix 8（M13）：新增 `tests/twin-provider.test.ts`（仿 `carbon-provider.test.ts` 風格，stub
  全域 `fetch`）：驗證 `createTwinProvider` 成功時把 `{berths:[{code,lat,lon,angle,nameZh}]}`
  映射成 `{berths:[{id,name}],trackCount}` 且 `source==='live'`；fetch 拒絕時回退為
  `{berths:[],trackCount:0}`。`npx vitest run` 由 8 → 10 通過（4 個測試檔）。
- **驗收**：`npx tsc --noEmit` 0 errors；`npx vitest run` 10/10 通過；`npm run build` 成功
  （39 modules）。Chromium：(a) carbon 頁開「單筆發行」modal（此次驗證時 PoC 後端剛好在線，
  108 筆真實 SU），在 `#one-ship`/`#one-gfi` 打 `1`/`2`/`3`/`0`/`5`/`6`，數字正確落入欄位、
  `location.hash`/`data-mode` 全程未變（未跳頁）；關閉 modal、focus 移到非輸入元素後按 `2`
  仍正確導覽到 policy、按 `0` 仍正確回到 hero。(b) carbon 頁標題列下無多餘空白、eyebrow 圓點
  電腦色值為 `rgb(233,188,99)`（即 `#E9BC63` 金色，非白色）。(c) `list_network_requests`
  全程（含跨頁導覽）38→115 筆請求皆無 `favicon.ico`；`list_console_messages` 全程僅
  `[vite] connecting/connected` debug 訊息，零錯誤。
- 本次修正未變更任何 spec 行為範圍以外的程式碼；詳細 file:line 對照與自我審查見
  `.superpowers/sdd/final-fix-report.md`（scratch 報告，未進版控）。

**Task 12（Policy screen + README + 全站驗收）完成 —— 12 個 task 全部完成。**
- 新增 `src/screens/policy/policy.html` + 重寫 `src/screens/policy/index.ts`（原為 stub）：標頭改用
  `screenHeader`；議題列（`.topic`，含「重新生成」鈕）、報告五段（`<h3>`+`<p>`，`html` 內含 cite span
  原樣塞入不逃逸）、Grounding 環形儀表（`data-lg-value` 吃 `snapshot.grounding`）與引用來源清單
  （`.srcrow` + `data-no`）皆由 `ctx.data.policy.snapshot()` 動態產生；`policy.html` 只留 `__TOPIC__`/
  `<!--SECTIONS-->`/`__GROUNDING__`/`__GNOTE__`/`__SRCCOUNT__`/`<!--SOURCES-->` 六個佔位標記（對齊
  dispatch/epidemic 既有手法）。互動逐字對齊基準檔 `/* 政策：生成動畫 + 引用連動 */`：「重新生成」
  點擊 → `#reportBody.skl`（blur 1.4s，含重入防護與按鈕文字「生成中…」）→ 還原 + `ctx.ui.toast`
  （訊息組字串 `${groundingNote} · Grounding ${grounding}%`，因 mock 無「量化數字總數」欄位，改用
  snapshot 既有兩個 grounding 欄位重組語意相近的句子，非臆造新數字）；`.cite` hover → 對應
  `.srcrow[data-no]` 加 `.hl`（mouseleave 移除）。Grounding 儀表由 router 首掛後既有的
  `behaviors.stats(section)` 掃描接手，無需本檔另呼叫 Kit API。
- 新增 `README.md`：專案簡介、安裝/啟動、`.env` 設定（複製 `.env.example`）、兩個 live demo 前置
  （carbon：PoC repo `make chain`+`make deploy`+`make api`；twin：`~/Desktop/LiDAR` 執行
  `npm run dev -- --port 5174`）、鍵盤快捷（`0`/`1-6`/`Enter`）、Chromium 瀏覽器需求。全文無 emoji。
- **全站驗收（對照 spec 第 10 節，逐項見下）全數通過**：
  1. `npx tsc --noEmit` 0 errors；`npx vitest run` 8/8 PASS（未新增測試，policy 為純視覺+互動
     screen）；`npm run build` 成功、無警告（39 modules transformed）。
  2. Chromium 冷啟動 → 封面 COVER →`Enter`→ 總覽 OVERVIEW → 按鍵 `1`-`6` 依序到達
     碳權/政策/孿生/派工/疫情/警報 → `0` 返回總覽（非重置回封面，Task 6 時序修正仍正確）→
     `Enter` 回封面：每一步 console 皆乾淨（僅預期內的 favicon.ico 404，全程零 JS 錯誤）。
  3. 四個 mock 頁互動逐一實測：政策「重新生成」（`skl` 動畫 + toast，以頁面內同步 JS 驗證
     immediate/after 兩個時間點的 class/文字狀態，避免 MCP 工具呼叫間延遲誤判）與 `.cite` hover
     （src=1、src=5 皆正確連動對應來源列）；派工滑桿拖到 90 分鐘讀數與熱區正確更新；警報分類篩選
     與模擬推播（buzz + 插入新泡泡 + 上限 3 則）皆正確；疫情頁純視覺渲染確認無誤。政策頁另與
     `docs/preview/preview-v3.html` 開分頁直接比對——內容/版面逐字一致，唯一差異：Grounding 說明文字
     基準檔用 `<br>` 強制分兩行，本頁 `groundingNote` 是純字串未含標記，故走文字自然流動（本次視窗寬度
     下顯示為一行）——刻意判斷不主動插入基準檔寫死位置的 `<br>`，避免對資料欄位做字面猜測式分割，
     純視覺差異、非行為或資料錯誤。
  4. 意外之喜：碳權 PoC 後端（埠 8000）與 LiDAR twin server（埠 5174）在驗收當下剛好都在執行中
     （非本 task 啟動，狀態延續自先前 session），故碳權頁與孿生頁這次直接看到真實 LIVE 資料
     （碳權：108 筆 SU、真實 dataHash；孿生：真實 3D 港區場景），而非降級模式；兩者的完整互動
     （碳權發行/掛單/購買/除役全流程、孿生時間軸拖曳與情境切換）在 Task 7/Task 8 已個別詳盡驗證過，
     本次不重跑，僅確認頁面可正常到達且渲染真實資料、console 無新增錯誤。
  5. `prefers-reduced-motion: reduce` 模擬（chrome-devtools MCP 的 `emulate` 工具未提供此參數，
     改用 Playwright MCP 的 `browser_run_code_unsafe` 呼叫真正的 `page.emulateMedia()`，確認
     `matchMedia(...).matches===true` 且 `.anim` 的 computed style 確實變成
     `opacity:1;transition:none`）：封面/總覽/碳權/政策/孿生/派工/疫情/警報全部八個畫面完整渲染，
     canvas（熱區/航跡）與儀表數字皆非卡在初始 0 或空白，整場 console 僅一則 favicon 404、無新增錯誤。
- 殘留事項（見第 5 節）：hero 背景素材仍是 canvas 點雲假資料（spec 4.2 註記「實作版可換」，未在
  12 個 task 範圍內，屬後續美化項）；本機累積了數個先前 task session 留下的背景 `npm run dev`
  進程（埠 5173/5175/5176，連同本次 5177）未關閉，demo 前建議清一次埠。

**Task 11（Alert screen）完成**，進入 Task 12。
- 新增 `src/screens/alert/alert.html` + 重寫 `src/screens/alert/index.ts`（原為 stub）：標頭改用
  `screenHeader`（模擬推播鈕塞進 `actionsHtml`）；四張 KPI 卡由 `statRow()` 產生；篩選 chips
  （全部/疫情/氣象/解除）與推播規則三顆 switch 為固定markup（`AlertSnapshot` 無對應欄位，非資料
  驅動）；feed 六列（含嚴重度色條 `sev`→`rose`/`amber`/`flame`/`ok` 四色查表）與手機 sms 泡泡改由
  `snapshot` 動態產生。篩選邏輯與「模擬推播」（toast + `.buzz` + 插入 `.sms.pop`、上限 3 則）逐字
  對齊基準檔。另補一手 `behaviors.switchTension`：`.lg-switch` 的 goo 液滴裝飾只在開機 boot() 掃
  一次，本頁三顆 switch 掛載較晚會錯過，比照 carbon/dispatch 手動補跑一次的既有手法。Chromium 已
  驗證：四卡動畫、四種篩選、六列色條、手機 mock、模擬推播（toast/buzz/插入/上限 3）、三顆 switch
  皆正確，主控台零錯誤。

**Task 10（Epidemic screen）完成**，進入 Task 11-12。
- 新增 `src/screens/epidemic/route.ts`：`drawRoute(canvas, ports)`，自基準檔「疫情航跡」JS（原
  `drawRoute`）逐字搬出並型別化。四港百分比站位（`POS`）與陸地點群散射角（`ANG`）沿用基準檔固定配置，
  按 `ports` 陣列索引配對；港名／`mark`（`dim`/`rose`/`amber`）顏色改吃 `ports` 參數，不再是基準檔
  寫死的字串。固定種子（`sd=99`）Park-Miller LCG 產生雜訊點與陸地點群，種子宣告於函式體內，每次呼叫
  皆重新起跑，故同一份 ports 重繪視覺一致。
- 新增 `src/screens/epidemic/epidemic.html`：自基準檔 `<!-- 疫情 -->` 的 `.cols` 區塊搬出（標頭不在
  此檔內）。風險環數字/等級、三因子 meter、停靠序列卡、防護建議、參考案例皆為動態內容，故只留
  `<!--PORTS-->`/`<!--FACTORS-->`/`<!--ADVICE-->` 三個清單佔位與 `__CAP__`/`__RISK__`/`__LEVEL__`/
  `__FACTORLBL__`/`__REFERENCE__` 五個單值佔位（對齊 hero.html／dispatch.html 既有手法）。
- 重寫 `src/screens/epidemic/index.ts`：標頭改用 `screenHeader`；`.tnode` 停靠卡依 `mark` 決定
  outline／文字色（`dim` 無標記、`rose`→`var(--rose)`/`.rosec`、`amber`→`var(--amber)`/`.amberc`），
  卡片間 `.tsep` 以 `join` 銜接（最後一張後不留分隔線）；三因子 meter 名稱/數值皆從 `snapshot.factors`
  映射產生（含風險環下方「靠港天數 × 來源強度 × 距離因子」文字亦由 `factors.map(f=>f.name).join(' × ')`
  組成，避免與 meter 清單重複寫死同一組名稱）；防護建議清單/參考案例/航跡圖說皆綁對應 snapshot 欄位
  （圖說船名沿用 `snapshot.ship`，取代基準檔寫死的 `SHIN KUANG 168`）。來源強度三個 pill（WHO/CDC/
  媒體）為固定文案，`EpidemicSnapshot` 無對應資料欄位，維持基準檔原樣寫死。
- **航跡 canvas 重繪綁在 `show()`（含首次），非 `mount()`**：手法對齊 Task 9 review 後定案的
  dispatch 版本——`redraw` 於 `mount()` 內指定（closure 捕捉當次 `snapshot.ports` 與 canvas 參照，
  不需另立模組層 `ports` 變數，因本頁無互動會改動它，不同於 dispatch 的 `currentT` 滑桿值），
  `Screen.show()` 呼叫 `redraw?.()`；另加一道「本頁 `.active` 時才生效」的視窗 `resize` 監聽。
- 無新增單元測試（task-10-brief 未要求；純視覺 screen，既有 3 個測試檔 8 tests 不受影響）。已用
  Chromium（chrome-devtools MCP）驗證：(1) 冷啟動 `#/epidemic`：航跡圖虛線依序連接馬尼拉→香港→
  基隆→高雄108、香港與高雄108節點正確疊兩圈警示環、陸地點群與雜訊點正確繪出；四張停靠卡 outline
  色（無/rose/無/amber）正確；風險環 72／橙級・限制登輪；三因子 meter 64/85/52 填色比例正確；
  來源強度 pill／防護建議三行／新光輪參考案例皆正確渲染。(2) 切到 hero、視窗縮至 1280×832、未經
  其他互動直接切回 epidemic：canvas backing store 1364×604（box 682×302，dpr2）與新尺寸精確吻合
  （ratio=1，非拉伸）。(3) 本頁 active 時再次 resize 至 1600×900：canvas 立即重繪為 1458×604 吻合
  新尺寸。全程 console 僅預期內的 favicon 404，無 JS 例外。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS（未新增測試，既有 3 個測試檔不受影響）。

**Task 9（Dispatch screen）完成**，進入 Task 10-11。
- 新增 `src/screens/dispatch/heat.ts`：`initHeat(canvas) → {draw(t)}`，自基準檔「派工熱區」JS
  （`drawHeat`/`heatVal`/`heatColor`/`hcoast`）逐字搬出並型別化。`hcoast(gx)` 一詞兩用：畫陸地帶／
  海岸線／5 座突堤，並用來判斷每格格心是否落在陸地帶內（`gy+0.5 < hcoast(gx+0.5)`）藉此跳過陸地格，
  確保降雨機率網格只畫在海面。
- 新增 `src/screens/dispatch/dispatch.html`：自基準檔 `<!-- 派工 -->` 的 `.cols` 區塊搬出（標頭不在
  此檔內，見下）。四張建議卡與風速圖 `data-lg-points` 皆為動態內容，故只留兩個佔位標記
  `<!--SUGGESTIONS-->`／`__WINDS__`（對齊 hero.html 的 `<!--ENTRIES-->` 手法），不手刻固定筆數卡片。
- 重寫 `src/screens/dispatch/index.ts`：標頭改用 `screenHeader`（CSI/POD/FAR 三個 `.pill`
  `data-lg-tip` 塞進 `actionsHtml`，值來自 `snapshot.metrics.toFixed(2)`）；建議卡 `.sev` 顏色依
  `level` 對應 `rose`→`var(--rose)`／`amber`→`var(--amber)`／`ok`→`var(--lg-accent)`；滑桿（0-90，
  step 10）`input` 時呼叫 `heat.draw(t)` + 更新 `+t min` 與讀數列，規則逐字對齊基準檔 `updDisp()`：
  雨量 ≥70 強降雨／≥50 大雨／否則陣雨，風速 ≥15 rose／≥13 amber／否則 teal（讀數列「12 →」的
  基準風速改綁 `snapshot.winds[0]`，不沿用基準檔寫死的字面 `12`，避免未來 mock 資料改動時跟文字
  兜不起來）。
- **熱區重繪綁在 `show()`（含首次），非 `mount()`**：`router.go()` 是「先 `await mount()`，mount
  完成後才同步幫 `<section>` 補上 `.active`」（`.screen{display:none}`／`.screen.active{display:block}`，
  見 tokens.css），且 router 為快取式——每個 screen 只 `mount()` 一次，之後每次切入只重加 `.active`
  並呼叫 `show?.()`（router.ts:84）。因此 canvas 這種「尺寸取自容器當下 `getBoundingClientRect`」的重繪
  必須綁 `show()`：(a) `mount()` 當下祖先仍 `display:none`，同步 `heat.draw` 會量到 0×0；(b) 若只在
  首次 `mount` 畫一次，使用者切到別頁時調整視窗大小、再切回本頁（未動滑桿）canvas 會維持舊尺寸被
  CSS 拉伸變形。做法對齊 `hero/index.ts` 的 `ovMap`：模組層 `currentT`（初始 30，slider input 時更新）
  + `redraw = () => apply(currentT)`；`Screen.show()` 呼叫 `redraw?.()`——router 補上 `.active` 之後才
  呼叫 `show()`，section 已可見、canvas 量得到正確尺寸，一手包辦「首次進入」與「每次重新進入」，不需
  rAF。另加一道「本頁 `.active` 時才生效」的視窗 `resize` 監聽，讓正在看本頁時調整視窗能即時重排熱區。
  （初版曾用 `requestAnimationFrame(() => apply(30))` 只在 `mount()` 內首繪，review round 1 指出這條
  路徑無法覆蓋「切走→resize→切回」的重繪，已改為上述 `show()` 版本。）
- 無新增單元測試（task-9-brief 未要求；純視覺 screen，既有 3 個測試檔 8 tests 不受影響）。已用
  Chromium（chrome-devtools MCP）驗證：(1) 直接冷啟動 `#/dispatch`：熱區首繪即正確（陸地帶／海岸線／
  5 座突堤／機率網格僅海面，無需先摸滑桿）、CSI 0.71／POD 0.83／FAR 0.21 三個 pill 與
  `data-lg-tip` tooltip（`pointerenter` 觸發，顯示「臨界成功指數」）皆正確、四張建議卡嚴重度色
  （rose/amber/amber/teal）與基準檔一致、風速折線圖正確繪出 10 點波峰。(2) 拖滑桿到 `t=0/60/90`：
  熱區熱點隨 t 沿海岸線平移、讀數列文字與顏色正確切換（含邊界值驗證：`t=60` 時風速剛好 13 → amber、
  雨量 48 → teal，門檻判斷為 `>=` 而非 `>` 確認無誤；`t=0` 顯示「現在」而非「未來 0 分鐘」）。
  (3) 由 hero 封面點「即時派工建議」入口卡走真實 SPA 導覽進入 dispatch（非 URL 冷啟動）首繪正確。
  (4) review round 1 重驗「切走→resize→切回」：1600px 時 canvas backing store 1458（box 729×dpr2），
  切到 hero、視窗縮到 1100px（本頁非 active，resize 監聽正確未觸發）、未動滑桿切回 dispatch，canvas
  backing store 重繪為 1145（box 573×dpr2）與新尺寸吻合、畫面銳利無拉伸，讀數列正確顯示 t=30 內容；
  切回後拖滑桿仍正常移動熱區與變色。全程 console 僅預期內的 favicon 404 與 Vite HMR 訊息，無 JS 例外。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS（未新增測試，既有 3 個測試檔不受影響）。

**Task 8（Twin screen + twin provider）完成**，進入 Task 9-11。
- 新增 `src/data/exchange/twin.ts`：`createTwinProvider(url?)` 逐字照 brief 實作，`snapshot()` 讀
  `/data/berths-khh.json`（新增 `public/data/berths-khh.json`，自 `~/Desktop/LiDAR/examples/
  kaohsiung-port/data/` 複製，72 筆泊位，形狀 `{capturedAtMs, berths:[{code,lat,lon,angle,nameZh}]}`）
  只取 code/nameZh 映射成 `{id,name}`（lat/lon/angle 屬 LiDAR 3D 世界座標，不進本層）；trackCount
  暫以 berths 長度代替，待 AIS 快照接入再補。`.url` 預設 `http://localhost:5174/examples/
  kaohsiung-port/index.html`（可用 `VITE_TWIN_URL` 覆寫）。
- 新增 `src/screens/twin/{index.ts,twin.html}`：自基準檔 `<!--孿生-->` 搬 float-tl 標頭／float-r 四張
  浮動面板（Pareto 候選方案/KPI/泊位甘特/情境切換）／底部 tline 時間軸——這些選擇器 Task 1 已整批
  複製進 `tokens.css`，不必另寫版面 CSS，也不用 `screenHeader`（twin 是滿版浮動玻璃頁）。主視覺區
  改為 `<iframe id="twinFrame">` 嵌 LiDAR kaohsiung-port 範例。時間軸 `input` → `NOW +HH:MM` 標籤 +
  KPI 兩格 `data-lg-value`（彈簧，公式對齊基準檔 2.7±0.6hr/4390±260t 正弦擺動）+
  `ctx.background.setTwinOffset(h)`；情境切換 4 顆按鈕 active 互斥 + `ctx.ui.toast`。`#twinTime` 是
  掛載後才插入 DOM，額外手動補跑一次 `LiquidGlass.behaviors.slider(el)`（否則填色卡在 CSS 預設
  50%，不會跟著拖曳更新，對齊 carbon/index.ts 對 `.lg-tabs` pill 的同一種補跑手法）。
- **實測發現並修正一個不在 brief 字面內的問題**：iframe `onload` 對「連線被拒」的失敗導覽一樣會
  觸發（Chromium 把該次導覽的內建錯誤頁當成一次「載入完成」），光靠 onload 完全無法分辨 LiDAR
  dev server 是否真的啟動——若照 brief 字面（純 onload 隱藏提示卡）實作，會在 server 未開時整頁
  被一塊不透明的空白錯誤頁蓋住，提示卡與背景點雲都看不到，直接違反本 task「fallback 卡 + full
  模式背景要露出」的驗收標準。改用背景 `fetch(url, {mode:'no-cors', cache:'no-store'})` 探測埠是否
  有人聽（連得上就 resolve，連線被拒/逾時才 reject）作為唯一依據；探測失敗時除了讓提示卡維持可見，
  還額外把 iframe 本身設 `display:none`（否則那塊不透明錯誤頁仍會蓋住卡片以外的區域）。探測成功則
  隱藏提示卡，iframe 維持顯示。
- `src/main.ts`：`twin` 由暫時的 mock stub 換成 `createTwinProvider(env.VITE_TWIN_URL)`；移除不再
  使用的 `mockProvider` import；改寫已過期的「carbon/twin 暫用 mock stub」註解為「carbon/twin
  現皆為 live provider」。
- 無新增單元測試（task-8 brief 未要求；既有 3 個測試檔 8 tests 不受影響）。已用 Chromium
  （chrome-devtools MCP）雙路徑驗證：(1) 必驗：埠 5174 無服務時，提示卡正確顯示、`data-mode="full"`
  背景點雲透過（隱藏後的）iframe 露出（含泊位編號、SHIN KUANG 168 標記）、float 面板玻璃折射正常、
  時間軸拖到 18 時 clock 顯示「NOW +18:00」、KPI 彈簧到 2.1 hr / 4,250 t（驗算 sin 公式相符）、
  slider 填色隨拖曳更新、情境按鈕互斥切換 + toast「情境已套用／「基準情境」重新推演未來 24 小時」
  正確跳出，console 僅預期內的 favicon 404 與埠 5174 連線被拒兩則網路訊息，無 JS 例外。(2) 選驗：
  於 `~/Desktop/LiDAR` 執行 `npm run dev -- --port 5174`（node_modules 已存在，未重跑 npm install）
  後重整本頁，確認 iframe 內正確顯示真實 3D 港區場景（船點/泊位輪廓/LiDAR 自己的疊加 UI），提示卡
  自動隱藏，本頁 float 面板仍正確蓋在 iframe 之上。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS。

**Task 7（Carbon screen，自 PoC 一比一搬入）完成**，進入 Task 8。
- 新增 `src/screens/hero/hero.html`（`?raw` 匯入的靜態 markup，含 `<!--ENTRIES-->`/`<!--STATS-->`/
  `<!--MODULES-->` 與 `__POINTS__`/`__LABELS__` 佔位標記）、`src/screens/hero/ovmap.ts`（`initOvMap(canvas)`
  自基準檔「總覽迷你地圖」JS 搬出，回傳 `{start,stop}`，rAF 迴圈自管，`prefers-reduced-motion` 時
  `start()` 只畫單幀）、重寫 `src/screens/hero/index.ts`（原「開發中」佔位頁換成完整兩段式 screen）。
- 封面（COVER）六入口卡與總覽（OVERVIEW）六模組卡皆由 `SCREENS.slice(1)` 動態生成（icon/short/color
  取自 registry），未手刻六份重複 markup；入口卡另加一組 hero 專屬的英文技術次標對照表（`SU TOKEN`／
  `LLM + RAG`… 六筆，registry 未定義此欄位，純裝飾用途，未擴充 registry 契約）。OVERVIEW 的四張 KPI 卡
  用 `statRow()` 綁 `overview.snapshot()`（`kpi.vessels`→今日進出港船舶… delta 文字含 U+2212 minus sign
  對齊基準檔字面）、六張模組卡摘要值用 `snapshot.modules` 依 id 對應、近 7 日 bar chart 綁
  `snapshot.weekly`。`mount()` 先 `await` snapshot 再一次性組完整 HTML 字串塞入，無二次載入態。
- 兩段式切換：CTA（`#toOverview`，單向 cover→ov，對齊基準檔）與 `hero:toggle` 事件（雙向切換，main.ts
  只在 `current()==='hero'` 時 dispatch，`mount()` 綁一次不解綁）共用 `setHeroState()`：切
  `body[data-hero]` 屬性、呼叫 `ctx.setMode`、開關 `ovMap.start()`/`stop()`。入口卡／模組卡共用
  `[data-go]` 委派點擊 → `location.hash`。
- 修正一個發現的時序問題（不在本 task 檔案清單，但不修會讓「總覽 → 點模組卡切到別的功能頁 → 按 `0`／
  點 rail 圖示切回 hero」這條路徑每次被重置回封面）：`router.go()` 對每個 screen 都固定「先呼叫
  `show()`，再呼叫 `applyMode(def.mode)`」，registry 給 hero 的 `mode` 固定是 `'cover'`，`show()` 若同步
  呼叫 `ctx.setMode` 會被那行立刻蓋掉。改用 `queueMicrotask` 延後寫入（仍在同一輪 event loop、下一次
  瀏覽器繪製前執行，Chromium 實測無閃爍），讓總覽態能在切出/切回 hero 後正確保留。未改動 `router.ts`。
- 已知的極小基準差異：模組卡／入口卡標題統一用 `registry.short`（"2.5D 沙盤推演"／"即時派工建議"／
  "疫情自動追溯"），基準檔 hero 頁本身寫的是較短版本（"沙盤推演"／"即時派工"／"疫情追溯"，與
  `overview.json` 的 `modules[].label` 一致但與 rail tooltip 用的 `registry.short` 不同）；判斷 registry
  為單一資料源、不另建平行對照表較穩妥，三個模組各少兩三個字，影響極小。
- 無新增單元測試（純視覺 screen，task-6-brief 未要求）。已用 Chromium（chrome-devtools MCP）驗證：
  COVER 態 rail 隱藏、六入口卡 icon/色彩/標籤正確、hover outline 隨 `--mc` 變色（實測 carbon 卡
  outline-color 變 `rgb(233,188,99)` 且卡片上移）、CTA 與署名行皆在；Enter／CTA → OVERVIEW：rail 滑入、
  四張 KPI 卡數字彈簧動畫＋sparkline、迷你地圖有陸地/突堤/泊位編號 108-113/航道/錨區/移動船點（實測
  600ms 間隔兩次 `canvas.toDataURL()` 不同，確認 rAF 真的在動）、六模組卡摘要值正確且可點擊跳頁、近
  7 日 bar chart 七根柱子渲染；切到 `#/carbon` 後確認 ovMap 的 canvas 停止變化（`hide()`/`stop()` 生效，
  不浪費背景運算）；按 `0` 從 carbon 切回 hero 確認正確回到 OVERVIEW（而非被重置成封面，驗證前述時序
  修正）；Enter 再次切回 COVER。全程 console 乾淨無 error/warning。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS（未新增測試，既有 3 個測試檔不受影響）、
  `npm run build` 產出正常（確認 `?raw` 匯入在 Rollup production build 下也能正常內聯）。

**Task 5（共用 UI 元件）完成**，進入 Task 6。
- `src/ui/components.ts` 新增三個純模板字串函式：`screenHeader(o)`（輸出 `<header class="anim" style="--d:0s">`，
  內含 `.eyebrow`〔圓點 `style="--mc:<color>"` + `.lbl`〕與 `.trow`〔`<h1>` + 技術徽章 `.lg-chip` chips +
  `srcChip()` + `.spacer` + `actionsHtml`〕；`--d:0s` 對齊基準檔每頁 header 皆最先進場，屬不變值故直接寫死）、
  `statRow(items)`（`.stats4` 格線包 N 張 `.lg.lg-stat` 卡，`data-lg-value`/`-prefix`/`-suffix`/`-decimals`/
  `-spark` 屬性驅動彈簧動畫與 sparkline，`delta` 為呼叫端字串原樣塞入 `.lg-stat__delta`〔不臆測漲跌樣式〕，
  `valueClass` 掛在 `.lg-stat__value` 上如 `goldc`）、`srcChip(source, label?)`（mock→灰 `.src` 預設
  「MOCK 資料」，live→綠 `.src.live` 預設「LIVE」，內含空 `<i>` 圓點）。未實作 `placeholderCard`——本計畫
  六個功能頁全部會做完，不會有模組維持佔位，brief 授權的範疇縮減（YAGNI）。
- 驗證時發現既有 gap 並一併修正：`router.ts` 首次 mount 只對新 section 的 `[data-lg]` 逐一 `attach()`
  處理玻璃折射，但 `.lg-stat`/`.lg-meter`/`.lg-gauge`/`svg[data-lg-chart]` 的屬性驅動彈簧數字/sparkline
  走另一條路徑（Kit 內部 `initStats`，只在開機 `LiquidGlass.init()` 掃過一次，`refresh()`/`attach()`
  都不會補掃動態 mount 的新內容），導致任何動態渲染的 `.lg-stat` 數值永遠停在初始 0。Kit 已把這個
  rescan 掛在既有公開 API `LiquidGlass.behaviors.stats(root)`（未改動 vendored 的 `liquid-glass.js`），
  因此在 `router.ts` 首掛流程補上 `window.LiquidGlass.behaviors.stats(section)` 一行呼叫，並於 `lg.d.ts`
  補上對應型別。此修正雖不在本 task 檔案清單，但不修就會讓 Task 6-12 任何用到這幾個儀表元件的頁面
  數值都是死的 0，故判斷必須一併處理，於本次 commit 一起送出。
- 無單元測試（純模板字串，由後續頁面驗證）。改以暫時渲染驗證：`src/screens/dispatch/index.ts` 的
  `mount()` 暫改呼叫 `screenHeader({...}) + statRow([...])`，樣本資料涵蓋全部 8 個欄位
  （label/value/suffix/prefix/decimals/delta/spark/valueClass）。`npm run dev` 後用 Chromium
  （chrome-devtools MCP）確認：eyebrow 圓點色與標籤、標題、技術徽章 chip、`srcChip` 的 mock（灰）與
  live（綠，含自訂 `sourceLabel`）兩種樣式皆正確；四張 `.lg.lg-stat` 玻璃卡的數字彈簧動畫、delta 徽章、
  sparkline、`goldc` valueClass、prefix/suffix/decimals 組合全數如預期渲染；切到 `#/twin` 再切回
  `#/dispatch` 確認無重複初始化或 console 錯誤。驗證後已將 `dispatch/index.ts` 還原為原本的
  「dispatch（開發中）」佔位內容（`git status` 確認該檔無異動）。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS（router.ts 改動未影響既有 4 個 router 測試）。

**Task 4（碳權 live provider）完成**，進入 Task 5。
- `src/data/exchange/carbon.ts` 實作 `createCarbonProvider(base?: string)` 函式：
  (1) 並列呼叫 `fetch(base + '/health')` 與 `fetch(base + '/state')`；
  (2) 從 `/state` 的 `sus` 陣列衍生 `CarbonSummary`（issued = 總數、tonsCirculating = status!=='retired' 的 amount 加總、listed/retired = 狀態計數）；
  (3) 任何 fetch 失敗時返回 `ok:false` 的預設值。`source: 'live'`，`base` 屬性可讀（簽約 `Provider<T> & { base: string }`）。
- TDD：`tests/carbon-provider.test.ts` 全域 mock fetch（vi.stubGlobal）驗證 2 案例（正常回應 + 後端當機），
  紅燈 → 綠燈。`npx vitest run` 全 8 tests PASS（碳權 2 + 路由 4 + mock 2）。`npx tsc --noEmit` 0 errors。
- `src/main.ts` 碳權佔位 stub 換成真實 provider 呼叫 `createCarbonProvider(env.VITE_CARBON_API)`，
  保留 `twin` 佔位（Task 8）。孿生 mock 仍保留 `mockProvider`。
- 已用 Chromium（chrome-devtools MCP）驗證：`npm run dev` 後頁面正常加載（hero 開發中屏幕），
  console 僅 Vite 連線訊息無 error。

**Task 3（資料交換層：types + mock providers）完成**，進入 Task 4。
- `src/data/types.ts` 由 Task 2 的最小 stub 換成完整版：`Provider<T>`、五個 mock screen 的
  Snapshot 型別（Overview/Policy/Dispatch/Epidemic/Alert）+ `CarbonSummary`/`TwinSnapshot`、
  `DataExchange`。新增 `src/data/exchange/mock.ts`（`mockProvider` source:'mock' +
  `structuredClone` 深拷貝、`createMockExchange` 組裝五個 provider）與 `src/data/mock/*.json`
  五檔，數值逐一自 `docs/preview/preview-src-v3.html` 抄出（overview KPI 128/47-62/3.4/4820、
  policy 五段 html+5 來源+grounding 93、dispatch WINDS/RAINS+4 建議卡+CSI/POD/FAR、epidemic
  SHIN KUANG 168/72 橙級+三因子+四港序列+新光輪案例、alert 4 KPI+6 feed+2 sms）。`main.ts` 的
  `ctx.data` 接上 `createMockExchange()`，carbon/twin 暫用 `mockProvider` stub 佔位
  （`base`/`url` 讀 `import.meta.env`，Task 4/8 換 live）。`tsconfig.json` 加
  `resolveJsonModule: true`。
- TDD：`tests/mock.test.ts`（深拷貝 + dispatch 10 timesteps 兩案例）先跑過 RED 才實作，之後
  `npx vitest run` 6/6 PASS（含 Task 2 router 測試）、`npx tsc --noEmit` 0 errors。
- 已用 Chromium（chrome-devtools MCP）驗證：`npm run dev` console 乾淨，瀏覽器內動態 import
  `mock.ts` 執行 `createMockExchange()` 確認五個 provider 皆 `source:'mock'` 且欄位數值與基準檔
  一致；切到 `#/twin` 佔位頁確認未受 main.ts 改動影響。

**Task 2（Registry + Router + Rail + 鍵盤）完成**，進入 Task 3。
- 新增 `src/screens/types.ts`（Mode/ToastOpts/ScreenCtx/Screen 契約）、`src/shell/registry.ts`（7 筆
  ScreenDef，順序 hero/carbon/policy/twin/dispatch/epidemic/alert）、`src/shell/router.ts`（`parseHash`/
  `applyMode`/`initRouter`，快取式：每 screen 只 mount 一次、DOM 不銷毀、切頁靠 `.active`/`.entered` +
  `show()`/`hide()`）、`src/shell/rail.ts`（自基準檔 rail markup 生成，`setActive` 切光條）；
  `main.ts` 接上 ctx/rail/router/鍵盤（`0`/`1`-`6`/`Enter`）。七個 screen 資料夾各放最小佔位頁
  （Task 6-12 陸續取代）。另建 `src/data/types.ts` 最小 stub（僅 `export interface DataExchange {}`）
  ——`ScreenCtx.data` 的 `import('../data/types').DataExchange` 型別參照需要此檔存在，完整欄位留給 Task 3。
- TDD：`tests/router.test.ts`（brief 給定的 4 個 parseHash 案例）先跑過 RED（router.ts 不存在）才實作，
  之後 `npx vitest run` 4/4 PASS。`npx tsc --noEmit` 在 `src/`/`tests/` 下 0 errors（node_modules 內
  vite/vitest/rollup 型別檔因缺 `@types/node`/`skipLibCheck` 而報錯，屬 Task 1 tsconfig 的既有落差，
  這次因為第一次有測試檔 import `vitest` 才浮現，不影響 `vitest run`/`vite dev`，留待之後視需要處理）。
- 已用 Chromium（chrome-devtools MCP）驗證：開機空 hash 進封面、rail 七顆按鈕滑鼠點擊與鍵盤
  `0`/`1`-`6`皆可切換、active 光條正確跟隨、`location.hash` 雙向同步、直接開 `#/twin` 冷啟動正確落在
  孿生佔位頁（並確認 `data-mode="full"` 有連動 Task 1 背景系統的增亮/泊位編號邏輯）、切走的 screen
  的 `<section>` 保留在 DOM 未被銷毀、重複導覽到同一頁不會產生重複 section 或多餘 console 訊息、
  全程 console 乾淨無 error。

**Task 1（專案骨架 + Kit + 背景系統）完成**，進入 Task 2。
- 視覺基準已定案並存檔：`docs/preview/preview-v3.html`（自含 Kit，瀏覽器直接開）與原始碼 `preview-src-v3.html`。
- 正式設計文件：`docs/superpowers/specs/2026-07-03-frontend-shell-design.md`（含 screen 契約、
  資料交換層介面、各頁規格、驗收標準）。
- 實作計畫：`docs/superpowers/plans/2026-07-03-frontend-shell.md`（12 tasks）。
- **Task 1 骨架+背景 完成**：Vite + vanilla TS 專案骨架（`package.json`/`vite.config.ts`/`tsconfig.json`）、
  Liquid Glass Kit 兩檔自 `~/Desktop/UI-ToolBox` 複製進 `src/ui/`、`tokens.css` 自預覽基準檔整塊搬入、
  `src/shell/background.ts` 完成點雲港口背景（build/coast/paint/loop/resize，含 full 模式增亮、
  泊位編號 108-113、SHIN KUANG 168 標記與 twinOffset 位移）並模組化為 `initBackground()`。
  已用 Chromium（chrome-devtools MCP）驗證：`npm run dev` 後畫面為深色點雲港口 + 光暈，console 乾淨
  （僅預期外的瀏覽器預設 favicon.ico 404），切換 `data-mode='full'` 背景增亮並顯示泊位編號。

歷程：

- 三個 layout 方向調研與比較（提案頁 artifact：https://claude.ai/code/artifact/24f960b5-26fb-4a46-bdef-9046ddfad841 ）
- 高擬真互動預覽，7 個畫面全部用真實 Liquid Glass Kit 元件拼成，已逐頁驗證無 console error
  （預覽 artifact：https://claude.ai/code/artifact/4a4a875e-004c-4cb8-ae28-4bdc6ac20fcd ；
  原始檔在 session scratchpad `imarine-ui-preview.html`，內含 Kit 全文，可直接在瀏覽器離線開）
- v2 修正：碳權頁改為一比一還原 PoC 原介面（使用者回饋 v1 差異太大）——工作台（篩選 rail
  + SU 卡片牆 + 排序/單筆發行）與稽核（減碳排行 bar chart + SU 帳本全表 + 逐筆驗證）兩分頁、
  四張統計卡（累計發行/總減碳噸數/已交易/已除役）、鏈路連線 chip 與批次發行上鏈鈕全數保留，
  僅原 topbar 品牌區由 shell 的 eyebrow 標頭與左側 rail 接手。**這就是 PoC 重構搬入的版面基準。**
- v3 全頁細節 refine（使用者回饋其他頁細節不足）：
  總覽主視覺改為有內容的迷你港圖（陸地/突堤/泊位編號 108-113/航道/錨區/移動船點）、
  等候時間改善改綠色徽章；封面加競賽署名行與入口卡模組色 hover；
  政策頁議題改輸入列樣式、生成報告有 blur 生成動畫 + toast、引用 chip hover 連動右欄來源；
  孿生頁 full 模式背景增亮、canvas 直繪泊位編號、焦點船 SHIN KUANG 168 標記、
  時間軸拖動連動船位、情境切換可點擊（觸發 toast）、甘特加 00-24 時間軸；
  派工頁熱區加海岸線/突堤地理脈絡（僅海面顯示網格）、滑桿連動下方風雨讀數、補 FAR 指標；
  疫情頁風險卡加三因子 lg-meter 拆解、航跡圖加各港陸地點群；
  警報頁加統計列（推播/觸及/送達/待回報）、分類篩選 chips（可過濾）、feed 增至 6 筆、
  手機改真機樣式（瀏海/時鐘/日期）、模擬推播觸發震動 + 新簡訊插入動畫。
- 正式設計文件：待預覽獲同意後寫入 `docs/superpowers/specs/`

## 2. 已定案的決策

| 決策 | 內容 |
|---|---|
| Layout | 方向 A（左側玻璃 icon rail + 整頁 screen）為骨架 |
| Hero | 兩段式：電影感封面（PPT 開場）→ Enter/點擊 → 戰情總覽（demo 用） |
| 技術棧 | Vite + vanilla TS，不用 React；舊 `介面/port-eco-dashboard` 棄用 |
| 元件 | 一律 Liquid Glass Kit（UI-ToolBox），不手寫玻璃 CSS |
| Carbon PoC | 重構成 shell 的一個 screen；拿掉其 topbar，操作邏輯與 API 呼叫完全不動 |
| 數位孿生 | 沙盤推演頁嵌入 LiDAR kaohsiung-port（iframe 先行）；hero 封面背景用孿生錄製影片 |
| 資料交換層 | 本期只做 carbon + twin 兩個 live provider，policy/dispatch/epidemic/alert 為 mock |
| 鍵盤 | `0` 總覽、`1-6` 功能頁、`Enter` 封面切換（簡報快捷） |

## 3. 使用場景（影響所有取捨）

競賽 PPT 簡報 + 現場 demo：hero 封面當 PPT 開頭，六個功能子頁在介紹各功能時展示。
16:9 大螢幕優先，資訊密度可高，動效要有記憶點但不干擾講解。

## 4. 下一步（依序）

**目前狀態（2026-07-11）：全站整合完成、main 乾淨（`85ffabd`，與 origin/main 同步、已 push），無排定的下一個開發 task。** 六大功能頁 + Settings + hero + 第 9 個 screen「數位員工」Agent（初建 8 tasks + 操作體驗 refine 5 tasks）皆已在 main：兩輪 SDD 各自逐 task review（Spec ✅ Quality Approved、各含 Important 已修）+ 最終 whole-branch review（opus, Ready to merge）+ fix wave 過關，先後 fast-forward 合併回 main（agent-screen `0886f72`→`8ceba6e`、refine `3fe240f`→`ac30ac8`）+ README/截圖（`85ed69a`）+ HANDOFF（`85ffabd`），**push origin main（`b755a08`→`85ffabd`，26 commits）**。三綠燈 tsc 0 / vitest 24 檔 108 / build ok。**使用者已用真實 Gemini key 實機測試 live 互動掛單 + SUGGEST chips = OK。** ★ 新 session 接手起點：從乾淨且已 push 的 main 開始；要開新工作先與使用者確認方向（無既定 backlog）。
- **兩輪合併細節（已完成）**：`agent-screen`（8-task 初建）先 ff 合回 main（`8ceba6e`）→ refine spec/plan commit 上 main（`3fe240f`）→ `agent-ux-refine`（5-task 打磨）自 `3fe240f` 分出、完成後 ff 合回 main（`ac30ac8`）→ README/HANDOFF 收尾 → push origin。兩條 feature 分支合併後皆已刪。
- **defer Minor（交未來，非阻斷）**：agent-screen 階段四個 + refine 階段幾個 defer Minor（如 `loop.ts` runTool 後 abort guard 已於 refine fix wave 補上、SUGGEST 分隔換行偶漏 trailing `<br>` cosmetic 等），皆在各輪最終 review triage=defer、不影響 demo，詳見第 1 節各輪段落。
- **唯一未竟善後（使用者端，非本地）**：協作者 PR #1（`feat/policy-rag-integration`）commits 已隨更早輪進 main——GitHub 上該 PR 不會自動關閉（head 分支 `origin/feat/policy-rag-integration` 仍在），需使用者在 GitHub 手動 close + 告知協作者（無 gh CLI 無法代做）。
- **demo/競賽前置**：carbon LIVE 需起 PoC 三件套 `make chain` + `make deploy` + `make api`（缺 Hardhat 鏈 :8545 則發行/掛單/購買/除役等寫鏈交易回 500 失敗）；policy/settings live 需起 rag-agent :8100（不起走完整 mock 示範）；**數位員工（agent）live 態需 `.env` 填 `VITE_GEMINI_API_KEY`（選填，未設定走劇本 mock、不影響 demo；key 僅限本機、勿提交、勿部署公開網址）**；真 Chrome 人工 click-through 一輪各頁互動手感（含本輪新增的互動掛單卡手感）。
- **（歷史）上一輪 policy-mock-fallback 合併細節（已完成，沿用記錄）**：本分支 `policy-mock-fallback`（base PR #1 `9033aba`，fork 自 alert 收尾點 `c1a2490`、不含 hero）以非 fast-forward merge 合回 main（保留 hero）→ merge commit `b755a08`（HANDOFF.md 手動解三處衝突、README.md／`src/data/types.ts` auto-merge）→ 合併後三綠燈（tsc 0 / vitest 18 檔 65 / build ok）→ push origin main（`4bd2be3`→`b755a08`）→ feature 分支 `policy-mock-fallback`（本地 + remote）已刪。
- **唯一未竟善後（使用者端，非本地，沿用自上一輪）**：協作者 PR #1（`feat/policy-rag-integration`）的 commit `9033aba` 已隨合併進 main——GitHub 上該 PR 不會自動關閉（head 分支 `origin/feat/policy-rag-integration` 仍在、未動），需使用者在 GitHub 手動 close 該 PR + 告知協作者（無 gh CLI 無法代做）。

（以下為 shell 建置期的歷史步驟，皆已完成）

1. ~~使用者審閱 spec（已通過 2026-07-03）~~ 完成
2. ~~實作計畫：`docs/superpowers/plans/2026-07-03-frontend-shell.md`（12 tasks，每 task 結尾為檢查點、由使用者 commit）~~ 完成
3. ~~Task 1：建 Vite 專案骨架 + 複製 Kit 兩檔 + 點雲港口背景系統~~ 完成
4. ~~Task 2：Registry + Router + Rail + 鍵盤（`0` 總覽、`1-6` 功能頁、`Enter` 封面切換）~~ 完成
5. ~~Task 3：資料交換層（types + mock providers）~~ 完成
6. ~~Task 4：Carbon live provider~~ 完成
7. ~~Task 5：共用 UI 元件~~ 完成
8. ~~Task 6：Hero screen（兩段式）~~ 完成
9. ~~Task 7：Carbon screen（自 PoC 一比一搬入）~~ 完成——拆成 carbon.{html,css,ts}+index.ts 四檔；PoC `<script>` 逐字搬入 `initCarbon`（僅 API→apiBase、查詢改綁 root 的 byId/qs/qsa、`// @ts-nocheck`），操作邏輯零改動；三件套（tabs/health-chip/發行鈕）以原 id 進 shell 標題列。**LIVE 驗證通過**：即時 stat/卡片/稽核、工作台⇄稽核切換、單筆發行→掛單→購買→除役全流程、離線 chip 降級皆與 PoC 一致，主控台零錯誤。
10. ~~Task 8：Twin screen + twin provider（LiDAR iframe 嵌入）~~ 完成——twin provider 讀真實泊位資料（72 筆）、screen 嵌 LiDAR iframe 並修正 onload 不可靠問題（改用 fetch no-cors 探測 + iframe display:none fallback）、24hr 時間軸與情境切換皆可互動。**兩路徑皆驗證**：無 server 時 fallback+背景點雲正確顯示；起 LiDAR dev server 後 iframe 正確顯示真實 3D 場景。
11. ~~Task 9：Dispatch screen（熱區 canvas + 預測時間軸 + 派工建議卡 + 風速圖）~~ 完成——拆成
    `heat.ts`（`initHeat` 自基準檔熱區 JS 搬出，含海岸線判斷僅海面繪格）+ `dispatch.html`
    + `index.ts` 三檔；CSI/POD/FAR pill、四張建議卡、風速圖皆綁 `dispatch.snapshot()`；滑桿
    讀數規則與色彩門檻逐字對齊基準檔。熱區重繪綁在 `Screen.show()`（快取式 router 每次切入都呼叫，
    含首次於 mount 之後）而非 `mount()`，一手涵蓋「首次進入」「切走→resize→切回」「本頁 active 時
    resize」三種尺寸重繪情境（review round 1 修正，對齊 hero 的 ovMap 手法）。Chromium 已驗證冷啟動、
    從 hero 點入口卡、切走→縮視窗→切回三條路徑熱區皆正確銳利。
12. ~~Task 10：Epidemic screen（航跡 canvas + 停靠序列卡 + 風險評分/三因子 meter + 防護建議 +
    參考案例）~~ 完成——`route.ts` 港點座標/陸地點群沿用基準檔固定配置，港名與 mark 顏色改吃
    `snapshot.ports`；canvas 重繪比照 Task 9 review 後定案的 `show()`/resize 手法（本頁無互動會
    改動 ports，故省去 dispatch 的 `currentT` 那層模組變數，直接讓 `redraw` closure 捕捉）。
    Chromium 已驗證冷啟動渲染、以及「切走→resize→切回」與「本頁 active 時 resize」兩條 canvas
    重繪路徑皆正確銳利。
13. ~~Task 11：Alert screen（KPI 統計列 + 分類篩選 feed + 手機 mock 模擬推播 + 推播規則開關）~~
    完成——篩選 chips 與模擬推播（toast/buzz/插入 sms/上限 3 則）逐字對齊基準檔；feed 六列嚴重度
    色條吃 `sev` 色彩關鍵字四色查表；`.lg-switch` 補跑 `behaviors.switchTension` 取得 goo 液滴動畫。
14. ~~Task 12：Policy screen（議題列 + 報告五段 + Grounding 儀表 + 引用來源，含生成動畫與引用連動
    互動）+ README.md + 全站驗收（對照 spec 第 10 節）~~ 完成——**12 個 task 全部完成**。驗收詳情見
    第 1 節 Task 12 條目；`tsc`/`vitest`/`build` 三者皆綠燈，Chromium 全站導覽（封面→總覽→六功能頁
    →返回）console 全程乾淨，四個 mock 頁互動與 `prefers-reduced-motion` 降級皆驗證通過。
    shell 骨架至此無下一個排定 task；殘留的美化/清理項見第 5 節。

## 5. 已知風險 / 注意

- **【Settings Task 8 驗收發現】settings 頁缺 `.swrap` 版心 → 固定 rail 疊在左欄分區導覽上（視覺缺陷，未修）**：
  其餘 7 個 screen 的 index.ts 都把內容包進 `<div class="swrap">`（`.swrap` 於 tokens.css 有 `padding-left:110px`
  讓開 `position:fixed` 的 `#rail`），但 `src/screens/settings/index.ts` 直接 `el.innerHTML = html.replace('<!--HEADER-->', …)`
  沒有 `.swrap` 包層（`settings.css` 開頭註解誤標「.swrap（shell 已提供）」——實則 shell 不自動提供，每個 screen
  各自在 index.ts 補）。CDP 實測：policy `.pcols` 左緣 x=151 已避開 rail（右緣 x=72），settings `.sgrid`/`.subnav`
  左緣 x=0 → rail（垂直置中，約 y=230–680）疊住左欄「沙盤推演/派工建議/疫情追溯/警報」等列。**功能完全不受影響**
  （Task 8 CDP 94/94 全過、8 頁 console 零錯誤、7 分區可點切、兩 modal 全流程正常），是純視覺佔位錯誤。屬 Task 2
  遺漏、逐 task review 未攔到。最小修法（product code，本 task 純文件+驗收依規約未自行改）：settings/index.ts 比照
  carbon/policy/alert 把 `screenHeader()+#s-settings 內容` 包進 `<div class="swrap">…</div>`（一行級），或 settings.css
  給 `#s-settings` 補 `padding` 左內距。**建議在使用者實機驗收前先修**。
- **twin-provider 測試 flaky（機器負載相關，非 policy 缺陷）**：`tests/twin-provider.test.ts`
  的「snapshot 映射 72 筆泊位與 443 條真實航跡數」在機器負載高時（如剛跑完 build）會逾時
  （Test timed out in 5000ms，非斷言失敗）——twin provider 的 `snapshot()` 動態載入 4.6MB
  航跡 JSON，超過 vitest 預設 5s testTimeout。機器閒置時通常過。若要根治：該 it 案例加第三參
  數 timeout（如 `20000`）或 `vitest.config` 設 `testTimeout`——屬 twin 檔，動前先問使用者。
  policy 改版本身測試（policy-generate 2/2、policy-mock 4/4）與其餘皆穩定綠。
- Liquid Glass 折射只在 Chromium 完整支援，其他瀏覽器自動降級磨砂——demo 機請用 Chrome/Edge。
- 玻璃需要豐富背景才看得見：文件型頁（carbon/policy）用罩幕壓暗而非純黑。
- Carbon live 需要先在 PoC repo 起 `make chain` + `make api`，demo 前要有開機 checklist。
- 預覽頁中的地圖/點雲是 canvas 假資料，正式版 hero 總覽主視覺與 twin 頁由 LiDAR 資產供給。
- `tsconfig.json` 未設 `skipLibCheck`/`@types/node`：獨立跑 `npx tsc --noEmit` 會對
  `node_modules` 內 vite/vitest/rollup 的型別檔報錯（缺 Node 環境型別），Task 2 加入第一個
  import `vitest` 的測試檔後才浮現；不影響 `vitest run`/`vite dev`/`vite build`，之後測試檔變多
  會持續出現，建議之後補 `skipLibCheck: true`（一行小改動，但屬既有檔案，先問過再動）。
  **（2026-07 更新：commit `90f8512`已補上 `skipLibCheck: true`，本項風險已解除，`npx tsc --noEmit`
  現況為 0 errors；段落保留作歷史紀錄，不再需要處理。）**
- **殘留事項（Task 12 收尾時盤點，非阻斷性，屬後續美化/環境整理）**：
  - hero 封面/總覽的主視覺仍是 `#harbor` canvas 點雲假資料（陸地/突堤/移動船點皆程式繪製），
    spec 4.2 原註記「實作版可換成孿生錄製影片或降級靜態圖」——12 個 task 皆未排入此素材製作，
    維持 canvas 版本作為展示已足夠使用，但若簡報前想換更擬真的背景，這是唯一還沒做的視覺項目。
  - 本機累積了數個先前 task session（Task 6/7/9/11 等）啟動後未關閉的背景 `npm run dev`
    進程（實測埠 5173/5175/5176 皆仍在回應，連同 Task 12 本次新起的 5177 共 4 個），皆為同一份
    原始碼、行為一致，不影響驗收結果，但正式 demo 前建議 `killall node`（或找出對應 PID）清一輪，
    避免上台時開錯分頁看到舊埠。
  - carbon 的「發行→掛單→購買→除役」全流程，Task 12 驗收時因為 PoC 後端（埠 8000）恰好仍在
    執行而確認了「能看到真實 LIVE 資料、console 無新增錯誤」，但完整的逐步操作流程未在
    Task 12 重跑一次（Task 7 當時已詳盡驗證過，判斷不需要每個 task 都重跑一次全流程）；demo
    前仍建議照 README 的前置步驟親自跑一次完整流程作最終確認。
    **（2026-07 更新：twin 頁已於「Twin 頁原生化改版」10 個 task 內完成原生化，不再是 iframe
    嵌入、不再需要另起 LiDAR server（埠 5174）或任何前置服務，上述 twin 相關部分已隨之作廢；
    demo checklist 現僅剩 carbon 這一項前置作業。）**

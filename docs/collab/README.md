# docs/collab —— 模組整合卡

每個接後端的模組一張整合卡（後端 repo、起服務、API 契約、驗收），**契約變更隨 PR 一起改卡**，
本目錄就是前後端資訊銜接的單一真相來源。協作流程與 PR 規範見根目錄 `CONTRIBUTING.md`。

## Port 與 env 變數分配總表（唯一權威，新後端先來認領）

| 模組 | 後端 repo | port | 前端 env 變數 | 整合卡 |
|---|---|---|---|---|
| carbon | iMarine-Carbon-Tokenization-POC | 8000（+8545 chain） | `VITE_CARBON_API` | 既有，見根 README「Live Demo 前置作業」，不另立卡 |
| policy | rag-agent | 8100 | `VITE_POLICY_API` | [policy.md](policy.md) |
| dispatch | 待協作者填 | **8200** | `VITE_DISPATCH_API` | [dispatch.md](dispatch.md) |
| epidemic | 待協作者填 | **8300** | `VITE_EPIDEMIC_API` | [epidemic.md](epidemic.md) |
| alert | 待協作者填 | **8400** | `VITE_ALERT_API` | [alert.md](alert.md) |

Port 慣例：每模組一個百位段，輔助服務用同段 +1～+99（carbon 的 8545 chain 為既成事實，
新模組不重蹈跨段）。twin 原生內建無後端、agent 直連 Gemini API，皆不佔 port 段。

## 維護者驗 PR 流程（協作者也看得到自己會被怎麼驗）

1. CI 綠（tsc + vitest + build，PR 頁面自動跑）
2. 照該模組整合卡 §2 起後端
3. `npm run verify:contract -- <模組>` —— 契約 smoke，判定後端形狀
4. `npm run verify:live -- <模組>` —— 頁面真渲染 + chip 轉 LIVE + 零 pageerror
5. 人眼看頁面（整合卡 §6 清單）
6. 合併

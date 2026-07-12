## 模組

<!-- 這個 PR 屬於哪個模組：policy / dispatch / epidemic / alert -->

## 改了什麼

<!-- 3-5 行摘要；若改了 src/data/types.ts，逐一列出動到的型別 -->

## 改動範圍自查（CONTRIBUTING §3 白名單）

- [ ] 只動了自己模組的 provider（`src/data/exchange/<模組>.ts`）
- [ ] 只動了自己模組的 screen（`src/screens/<模組>/`）與 settings section
- [ ] `src/data/types.ts` 只動自己模組的型別區塊（若有，已在上方列出）
- [ ] 沒動禁改清單（`src/shell/`、`src/ui/`、`src/main.ts`、`index.html`、其他模組、`package.json`、`.github/`、`scripts/demo/`、`CLAUDE.md`/`HANDOFF.md`）

## 契約變更

- [ ] 無
- [ ] 有 —— `docs/collab/<模組>.md` §4 與 `scripts/verify/contracts/<模組>.mjs` 已同步更新（含 §8 變更紀錄）

## 測試證據

- [ ] `npm run check` 三綠燈（貼上尾段輸出）
- [ ] `npm run verify:contract -- <模組>` 結果（或勾此項並說明不適用原因：＿＿）
- [ ] `npm run verify:live -- <模組>` 結果（或勾此項並說明不適用原因：＿＿）

## 頁面截圖

<!-- 改動頁面的截圖（verify:live 產出的 tmpdir 截圖亦可） -->

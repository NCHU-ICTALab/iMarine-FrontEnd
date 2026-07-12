/* dispatch 契約待定——後端 API 定案的第一個 live PR 必須把本檔填實（CONTRIBUTING §6）。
   填實時照 contracts/policy.mjs 的形狀：export default { base, checks }；
   base 讀 process.env.VITE_DISPATCH_API ?? 'http://127.0.0.1:8200'（port 分配見 docs/collab/README.md）。
   UI 需要的資訊參考 docs/collab/dispatch.md 附錄（前端 mock 欄位形狀）。 */
export default {
  pending: true,
  reason: '後端 API 契約尚未定案（見 docs/collab/dispatch.md §4）',
};

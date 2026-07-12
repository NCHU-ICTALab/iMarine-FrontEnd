/* epidemic live 斷言待定——後端契約定案的第一個 live PR 必須把本檔填實（CONTRIBUTING §6）。
   填實時照 live/policy.mjs 的形狀：export default { id, asserts(page) }。
   dispatch/epidemic/alert 頁有資料源 chip（policy 是特例沒有），標配斷言至少含：
   1) #s-<模組> .src.live 存在（chip 轉 LIVE）；2) KPI 統計列數字非空；3) 主視覺容器非空。
   epidemic 填實注意：Mapbox GL 為 WebGL，runner 已帶 --use-angle=swiftshader（勿加 --disable-gpu），
   且需 .env 的 VITE_MAPBOX_TOKEN。 */
export default {
  pending: true,
  reason: '後端 API 契約尚未定案（見 docs/collab/epidemic.md §4/§6）',
};

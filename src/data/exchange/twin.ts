import type { Provider, TwinSnapshot } from '../types';

/* Twin live provider — Task 8。
   snapshot() 讀 public/data/berths-khh.json（自 LiDAR repo 的 examples/kaohsiung-port/data 複製，
   形狀已查證：{ capturedAtMs, berths: [{ code, lat, lon, angle, nameZh }] }），只取 code/nameZh
   映射成 DataExchange 的 { id, name }；lat/lon/angle 是 LiDAR 3D 場景自己的世界座標系統，
   不必也不進本層（本層只給 UI 用作識別/計數，真正的 3D 定位交給 iframe 內的 LiDAR 引擎）。
   trackCount 先以 berths 長度代替——待之後接上 AIS 回放快照才有真正「在港船舶數」，見 task-8-brief。
   .url 供 twin screen 的 iframe src 使用（LiDAR dev server，預設 :5174，可用 VITE_TWIN_URL 覆寫）。 */
export function createTwinProvider(
  url: string = (import.meta as any).env?.VITE_TWIN_URL ?? 'http://localhost:5174/examples/kaohsiung-port/index.html',
): Provider<TwinSnapshot> & { url: string } {
  return {
    source: 'live', url,
    async snapshot() {
      try {
        const data = await fetch('/data/berths-khh.json').then(r => r.json());
        const list = (data.berths ?? []).map((b: { code: string; nameZh: string }) =>
          ({ id: b.code, name: b.nameZh }));
        return { berths: list, trackCount: list.length };
      } catch { return { berths: [], trackCount: 0 }; }
    },
  };
}

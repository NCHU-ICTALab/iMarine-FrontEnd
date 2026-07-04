import type { Provider, TwinSnapshot } from '../types';
/* Twin live provider — 原生化版。
   berths（12KB）靜態 import 無妨；航跡檔 4.6MB 只准動態 import()（snapshot() 被叫到才載），
   守住「大型資料不進開機主 bundle」的懶載入邊界（spec §5/§10）。 */
import berthsData from '../../screens/twin/data/berths-khh.json';

export function createTwinProvider(): Provider<TwinSnapshot> {
  return {
    source: 'live',
    async snapshot() {
      try {
        const tracks = await import('../../screens/twin/data/ais-tracks/khh-2026-06-19.json');
        const list = (berthsData.berths ?? []).map((b: { code: string; nameZh: string }) =>
          ({ id: b.code, name: b.nameZh }));
        return { berths: list, trackCount: (tracks.default as { ships: unknown[] }).ships.length };
      } catch { return { berths: [], trackCount: 0 }; }
    },
  };
}

import type { Provider, CarbonSummary } from '../types';

export function createCarbonProvider(
  base: string = (import.meta as any).env?.VITE_CARBON_API ?? 'http://127.0.0.1:8000',
): Provider<CarbonSummary> & { base: string } {
  return {
    source: 'live', base,
    async snapshot() {
      try {
        const [h, st] = await Promise.all([
          fetch(base + '/health').then(r => r.json()),
          fetch(base + '/state').then(r => r.json()),
        ]);
        const sus: any[] = st.sus ?? [];
        return {
          ok: !!h.ok,
          issued: sus.length,
          tonsCirculating: sus.filter(s => s.status !== 'retired').reduce((a, s) => a + (s.amount ?? 0), 0),
          listed: sus.filter(s => s.status === 'listed').length,
          retired: sus.filter(s => s.status === 'retired').length,
        };
      } catch {
        return { ok: false, issued: 0, tonsCirculating: 0, listed: 0, retired: 0 };
      }
    },
  };
}

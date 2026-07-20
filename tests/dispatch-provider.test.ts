import { describe, it, expect, vi } from 'vitest';
import { createDispatchProvider } from '../src/data/exchange/dispatch';
import { createMockExchange } from '../src/data/exchange/mock';

function mockRiskResponse(metrics?: { available: boolean; csi?: number; pod?: number; far?: number }) {
  return {
    metrics: {
      ...(metrics ?? { available: true, csi: 0.5524, pod: 0.6259, far: 0.1754 }),
      by_horizon: {
        H1: { csi: 0.5524, pod: 0.6259, far: 0.1754 },
        H2: { csi: 0.1111, pod: 0.2222, far: 0.3333 },
        H3: { csi: 0.3185, pod: 0.3597, far: 0.2647 },
        H4: { csi: null, pod: null, far: null },
      },
    },
    forecast_anchors: [
      {
        offset_minutes: 30,
        rain: { amount_level: '大雨' },
        wind_speed: { predicted_mps: 12.0, beaufort: { scale: 6 } },
        wind_gust: { predicted_mps: 14.0 },
        dispatch_suggestion: '建議限制吊掛、高處、臨水或其他受天氣影響較大的作業。',
        dispatch_risk_level: 'high_risk',
      },
      {
        offset_minutes: 60,
        rain: { amount_level: '大雨' },
        wind_speed: { predicted_mps: 11.0, beaufort: { scale: 6 } },
        wind_gust: { predicted_mps: 13.0 },
        dispatch_suggestion: '建議限制吊掛、高處、臨水或其他受天氣影響較大的作業。',
        dispatch_risk_level: 'warning',
      },
      {
        offset_minutes: 90,
        rain: { amount_level: '小雨' },
        wind_speed: { predicted_mps: 9.0, beaufort: { scale: 5 } },
        wind_gust: { predicted_mps: 11.0 },
        dispatch_suggestion: '可正常安排作業，持續監測天氣變化。',
        dispatch_risk_level: 'watch',
      },
      {
        offset_minutes: 120,
        rain: { amount_level: '無' },
        wind_speed: { predicted_mps: 6.0, beaufort: { scale: 4 } },
        wind_gust: { predicted_mps: 8.0 },
        dispatch_suggestion: '可正常安排作業，持續監測天氣變化。',
        dispatch_risk_level: 'normal',
      },
    ],
    cwa: [
      { window: '+3h', rainLevel: '豪雨', beaufort: 7 },
      { window: '+6h', rainLevel: '無', beaufort: 3 },
    ],
  };
}

describe('dispatch live provider', () => {
  it('live 成功時覆蓋 stable 情境的 nowcast/cwa，rain/typhoon 不受影響', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mockRiskResponse()))));
    const s = await createDispatchProvider('http://x').snapshot();
    const mockSnap = await createMockExchange().dispatch.snapshot();

    const stable = s.scenarios.find((x) => x.id === 'stable')!;
    expect(stable.nowcast).toEqual({ rainLevel: '大雨', beaufort: 6, windAvg: 12.0, windGust: 14.0 });
    expect(stable.cwa).toEqual([
      { window: '+3h', rainLevel: '豪雨', beaufort: 7 },
      { window: '+6h', rainLevel: '無', beaufort: 3 },
    ]);
    expect(stable.liveAnchors).toHaveLength(4);

    const rain = s.scenarios.find((x) => x.id === 'rain')!;
    const typhoon = s.scenarios.find((x) => x.id === 'typhoon')!;
    expect(rain).toEqual(mockSnap.scenarios.find((x) => x.id === 'rain'));
    expect(typhoon).toEqual(mockSnap.scenarios.find((x) => x.id === 'typhoon'));
  });

  it('門檻表依 nowcast（beaufort 6 / 大雨）算出 stop/warn/ok 混合狀態', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mockRiskResponse()))));
    const s = await createDispatchProvider('http://x').snapshot();
    const stable = s.scenarios.find((x) => x.id === 'stable')!;
    const statusOf = (id: string) => stable.ops.find((o) => o.id === id)!.now.status;

    expect(statusOf('crane')).toBe('stop');   // beaufort 6 >= 6
    expect(statusOf('grain')).toBe('stop');   // 大雨
    expect(statusOf('coal')).toBe('warn');    // beaufort 6 >= 5，< 7
    expect(statusOf('tanker')).toBe('warn');  // beaufort 6 >= 5
    expect(statusOf('pilot')).toBe('warn');   // beaufort 6 >= 6
    expect(statusOf('mooring')).toBe('warn'); // beaufort 6 >= 6
    expect(statusOf('yard')).toBe('ok');      // beaufort 6 < 7
  });

  it('cwa3/cwa6 分別依 +3h（beaufort 7）與 +6h（beaufort 3）獨立算出狀態', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mockRiskResponse()))));
    const s = await createDispatchProvider('http://x').snapshot();
    const crane = s.scenarios.find((x) => x.id === 'stable')!.ops.find((o) => o.id === 'crane')!;
    expect(crane.cwa3).toBe('stop'); // +3h beaufort 7 >= 6
    expect(crane.cwa6).toBe('ok');   // +6h beaufort 3 < 6
  });

  it('metrics.available=true 時覆蓋 stable 情境的 csi/pod/far', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mockRiskResponse()))));
    const s = await createDispatchProvider('http://x').snapshot();
    const stable = s.scenarios.find((x) => x.id === 'stable')!;
    expect(stable.metrics).toEqual({ csi: 0.5524, pod: 0.6259, far: 0.1754 });
  });

  it('metrics.available=false 時維持 mock 靜態 csi/pod/far，不用 null 覆蓋', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(mockRiskResponse({ available: false })))),
    );
    const s = await createDispatchProvider('http://x').snapshot();
    const mockSnap = await createMockExchange().dispatch.snapshot();
    const stable = s.scenarios.find((x) => x.id === 'stable')!;
    const mockStable = mockSnap.scenarios.find((x) => x.id === 'stable')!;
    expect(stable.metrics).toEqual(mockStable.metrics);
  });

  it('liveAnchors 四筆都帶有正確的 suggestion 與收斂後的 riskLevel', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mockRiskResponse()))));
    const s = await createDispatchProvider('http://x').snapshot();
    const anchors = s.scenarios.find((x) => x.id === 'stable')!.liveAnchors!;

    expect(anchors[0].suggestion).toBe('建議限制吊掛、高處、臨水或其他受天氣影響較大的作業。');
    expect(anchors[0].riskLevel).toBe('warn');   // high_risk → warn
    expect(anchors[1].riskLevel).toBe('warn');   // warning → warn
    expect(anchors[2].riskLevel).toBe('ok');     // watch → ok
    expect(anchors[3].riskLevel).toBe('ok');     // normal → ok
    expect(anchors[3].suggestion).toBe('可正常安排作業，持續監測天氣變化。');
  });

  it('stable.metricsByHorizon 四組數字正確透傳（含 null）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mockRiskResponse()))));
    const s = await createDispatchProvider('http://x').snapshot();
    const stable = s.scenarios.find((x) => x.id === 'stable')!;

    expect(stable.metricsByHorizon).toEqual({
      H1: { csi: 0.5524, pod: 0.6259, far: 0.1754 },
      H2: { csi: 0.1111, pod: 0.2222, far: 0.3333 },
      H3: { csi: 0.3185, pod: 0.3597, far: 0.2647 },
      H4: { csi: null, pod: null, far: null },
    });
  });

  it('後端不在時（fetch 例外）整份回傳純 mock，不拋錯', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('refused'); }));
    const s = await createDispatchProvider('http://x').snapshot();
    const mockSnap = await createMockExchange().dispatch.snapshot();
    expect(s).toEqual(mockSnap);
  });

  it('後端回非 2xx 時整份回傳純 mock', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const s = await createDispatchProvider('http://x').snapshot();
    const mockSnap = await createMockExchange().dispatch.snapshot();
    expect(s).toEqual(mockSnap);
  });
});

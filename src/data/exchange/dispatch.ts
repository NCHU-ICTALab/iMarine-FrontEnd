/* Dispatch live provider — 打真後端 /api/v1/dispatch/risk。
   snapshot() 仍以 mock 三情境（stable/rain/typhoon）為底：只覆蓋 stable 情境的
   nowcast/cwa/ops 燈號，rain/typhoon 兩情境維持純 demo 模擬用途不變。
   後端不在時（fetch 例外或非 2xx）整份回 mock，不影響 demo（比照 ./policy.ts）。

   ops[] 的法規/慣例規則文字（rules[]）維持前端靜態法規庫，不由後端生成；
   only now.status/now.action/cwa3/cwa6 這幾個「燈號」欄位隨 live 數值重算。
   下面 OP_THRESHOLDS 門檻表是從 src/data/mock/dispatch.json 既有 3 情境×7 作業
   （21 個資料點）反推、逐一核對吻合，但不是港務單位正式核可的規則表，正式上線前
   需域專家（港務/工安）覆核——見本次 PR 說明。 */
import type { CwaWindow, DispatchSnapshot, HorizonMetrics, LiveAnchor, OpRow, OpStatus, Provider, RainLevel } from '../types';
import dispatchMock from '../mock/dispatch.json';

const RAIN_LEVELS: RainLevel[] = ['無', '小雨', '大雨', '豪雨', '大豪雨', '超大豪雨'];
const RAIN_STOP_LEVELS: RainLevel[] = ['大雨', '豪雨', '大豪雨', '超大豪雨'];

function normalizeRainLevel(value: unknown): RainLevel {
  return typeof value === 'string' && (RAIN_LEVELS as string[]).includes(value) ? (value as RainLevel) : '無';
}

type OpId = OpRow['id'];
interface StatusInput { beaufort: number; rainLevel: RainLevel }

const OP_THRESHOLDS: Record<OpId, (i: StatusInput) => OpStatus> = {
  crane: ({ beaufort }) => (beaufort >= 6 ? 'stop' : 'ok'),
  grain: ({ rainLevel }) => (RAIN_STOP_LEVELS.includes(rainLevel) ? 'stop' : 'ok'),
  coal: ({ beaufort, rainLevel }) =>
    beaufort >= 7 ? 'stop' : beaufort >= 5 || RAIN_STOP_LEVELS.includes(rainLevel) ? 'warn' : 'ok',
  tanker: ({ beaufort }) => (beaufort >= 7 ? 'stop' : beaufort >= 5 ? 'warn' : 'ok'),
  pilot: ({ beaufort }) => (beaufort >= 7 ? 'stop' : beaufort >= 6 ? 'warn' : 'ok'),
  mooring: ({ beaufort }) => (beaufort >= 6 ? 'warn' : 'ok'),
  yard: ({ beaufort }) => (beaufort >= 7 ? 'warn' : 'ok'),
};

/* status → 沿用 mock 既有措辭；mooring/yard 的 warn 態依 beaufort 再細分既有兩種文字。 */
const OP_ACTION_TEXT: Record<OpId, (status: OpStatus, beaufort: number) => string> = {
  crane: (s) => (s === 'stop' ? '停工' : '正常'),
  grain: (s) => (s === 'stop' ? '停裝關艙' : '正常'),
  coal: (s) => (s === 'stop' ? '卸煤機固定' : s === 'warn' ? '戒備' : '正常'),
  tanker: (s) => (s === 'stop' ? '危險品船出港' : s === 'warn' ? '續作+監控' : '正常'),
  pilot: (s) => (s === 'stop' ? '停止進出港' : s === 'warn' ? '加派拖船' : '正常'),
  mooring: (s, bf) => (s === 'warn' ? (bf >= 7 ? '加派加纜 5/7' : '加派 +2') : '正常'),
  yard: (s) => (s === 'warn' ? '貨櫃加固' : '正常'),
};

function computeOpStatus(opId: OpId, input: StatusInput): OpStatus {
  return OP_THRESHOLDS[opId](input);
}

interface BackendWindField { predicted_mps?: number; beaufort?: { scale?: number } }
interface BackendAnchor {
  offset_minutes?: number;
  rain?: { amount_level?: string };
  wind_speed?: BackendWindField;
  wind_gust?: BackendWindField;
  dispatch_suggestion?: string;
  dispatch_risk_level?: string;
}
interface BackendCwaWindow { window?: string; rainLevel?: string; beaufort?: number }
interface BackendHorizonMetric { csi?: number | null; pod?: number | null; far?: number | null }
interface BackendMetrics {
  available?: boolean;
  csi?: number | null;
  pod?: number | null;
  far?: number | null;
  by_horizon?: Record<string, BackendHorizonMetric>;
}
interface BackendRiskResponse {
  forecast_anchors?: BackendAnchor[];
  cwa?: BackendCwaWindow[];
  metrics?: BackendMetrics;
}

/* 後端 dispatch_risk_level 是 5 級（normal<watch<warning<high_risk<stop，
   見 kaohsiung_microclimate_lstm/src/risk/level_mapping.py::LEVEL_ORDER），
   前端 hero 底色只有 3 態，收斂規則：normal/watch→ok、warning/high_risk→warn、stop→stop。
   無法辨識的值（欄位缺失/未知字串）回傳 undefined，呼叫端會退回既有 WXCLS[rainLevel] 查表。 */
function toRiskLevel(level: unknown): OpStatus | undefined {
  switch (level) {
    case 'normal':
    case 'watch':
      return 'ok';
    case 'warning':
    case 'high_risk':
      return 'warn';
    case 'stop':
      return 'stop';
    default:
      return undefined;
  }
}

interface Nowcast { rainLevel: RainLevel; beaufort: number; windAvg: number; windGust: number }

function toNowcast(anchor: BackendAnchor): Nowcast {
  return {
    rainLevel: normalizeRainLevel(anchor.rain?.amount_level),
    beaufort: anchor.wind_speed?.beaufort?.scale ?? 0,
    windAvg: anchor.wind_speed?.predicted_mps ?? 0,
    windGust: anchor.wind_gust?.predicted_mps ?? 0,
  };
}

function toCwaWindow(w: BackendCwaWindow, fallbackWindow: CwaWindow['window']): CwaWindow {
  return {
    window: w.window === '+3h' || w.window === '+6h' ? w.window : fallbackWindow,
    rainLevel: normalizeRainLevel(w.rainLevel),
    beaufort: typeof w.beaufort === 'number' ? w.beaufort : 0,
  };
}

function toLiveAnchor(anchor: BackendAnchor): LiveAnchor {
  return {
    offsetMinutes: anchor.offset_minutes ?? 0,
    ...toNowcast(anchor),
    suggestion: typeof anchor.dispatch_suggestion === 'string' ? anchor.dispatch_suggestion : undefined,
    riskLevel: toRiskLevel(anchor.dispatch_risk_level),
  };
}

function toHorizonMetrics(raw: Record<string, BackendHorizonMetric> | undefined): Record<'H1' | 'H2' | 'H3' | 'H4', HorizonMetrics> {
  const pick = (h: string): HorizonMetrics => {
    const v = raw?.[h];
    return { csi: v?.csi ?? null, pod: v?.pod ?? null, far: v?.far ?? null };
  };
  return { H1: pick('H1'), H2: pick('H2'), H3: pick('H3'), H4: pick('H4') };
}

function applyLiveOps(ops: OpRow[], nowcast: Nowcast, cwa: [CwaWindow, CwaWindow]): OpRow[] {
  return ops.map((op) => {
    const nowStatus = computeOpStatus(op.id, nowcast);
    return {
      ...op,
      now: { status: nowStatus, action: OP_ACTION_TEXT[op.id](nowStatus, nowcast.beaufort) },
      cwa3: computeOpStatus(op.id, cwa[0]),
      cwa6: computeOpStatus(op.id, cwa[1]),
    };
  });
}

export function createDispatchProvider(
  base: string = (import.meta as any).env?.VITE_DISPATCH_API ?? 'http://127.0.0.1:8200',
): Provider<DispatchSnapshot> {
  return {
    source: 'live',
    async snapshot() {
      const snap = structuredClone(dispatchMock as DispatchSnapshot);
      try {
        const r = await fetch(`${base}/api/v1/dispatch/risk?target_area=KHH`);
        if (!r.ok) return snap;
        const d: BackendRiskResponse = await r.json();
        const anchors = d.forecast_anchors ?? [];
        const h1 = anchors[0];
        if (!h1) return snap;

        const stable = snap.scenarios.find((s) => s.id === 'stable');
        if (!stable) return snap;

        const nowcast = toNowcast(h1);
        const cwaRaw = Array.isArray(d.cwa) ? d.cwa : [];
        const cwa: [CwaWindow, CwaWindow] = [
          cwaRaw[0] ? toCwaWindow(cwaRaw[0], '+3h') : stable.cwa[0],
          cwaRaw[1] ? toCwaWindow(cwaRaw[1], '+6h') : stable.cwa[1],
        ];

        stable.nowcast = nowcast;
        stable.cwa = cwa;
        stable.ops = applyLiveOps(stable.ops, nowcast, cwa);
        stable.liveAnchors = anchors.map(toLiveAnchor);

        // 後端第48項：/api/v1/dispatch/risk 頂層 metrics（H1 rain_probability 的 CSI/POD/FAR）。
        // available=false（報表尚未產生）時維持 mock 靜態值，不用 null 覆蓋掉展示用數字。
        const metrics = d.metrics;
        if (metrics?.available && typeof metrics.csi === 'number' && typeof metrics.pod === 'number' && typeof metrics.far === 'number') {
          stable.metrics = { csi: metrics.csi, pod: metrics.pod, far: metrics.far };
        }
        // 後端第49項：metrics.by_horizon（H1~H4逐anchor CSI/POD/FAR），拖曳時間軸用。
        if (metrics?.by_horizon) {
          stable.metricsByHorizon = toHorizonMetrics(metrics.by_horizon);
        }
      } catch {
        /* 後端不在 → 整份回 mock，demo 不掛 */
      }
      return snap;
    },
  };
}

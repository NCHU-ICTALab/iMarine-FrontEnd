/* Epidemic live provider — 打疫情自動追溯後端（MOTC×aisstream 串聯 + 疾管署/WHO 比對）。
   後端 GET /assessments 回「每艘抵達高雄的船最新風險 + 比對到的真實疫情」（標準輸出格式）。
   provider 把它轉成 epidemic screen 需要的 snapshot：
     - factors：由 risk_level + score 反推，使 correlate.ts 的 scoreVessel 重算出同一級（tier）。
     - ports：前一外國港 + 高雄（末站 berthed），day 落在 14 天窗口（航程天數由港別估）。
     - events/intel：由 matched_outbreaks 生成（落在前一港停靠日 → rose 命中）。
     - advice/sms：依風險級別模板（後端 recommendation 未進標準輸出，故前端以級別套模板）。
   後端不在（或無資料）時整份退 mock，demo 現場不掛（比照 src/data/exchange/policy.ts）。
   pipeline 盡量套真實計數；inflowPool 沿用 mock（「模擬偵測」是展示裝置，非真實資料）。 */
import type {
  EpidemicSnapshot, EpidemicVessel, EpidemicFactors, EpidemicPort,
  EpidemicEvent, EpidemicIntel, EpidemicPipelineStage, Provider, Source,
} from '../types';
import epidemicMock from '../mock/epidemic.json';

const WINDOW_DAYS = 13; // 對齊 mock timeRange.now（0..13 共 14 天窗口）；末站高雄 = now

/* UNLOCODE → 中文港名（須與 src/screens/epidemic/worldmap.ts 的 PORT_COORDS 對得上，
   否則地圖無座標）。未知代碼原樣回傳（地圖會略過、泳道仍可顯示名稱）。 */
const PORT_ZH: Record<string, string> = {
  TWKHH: '高雄', TWKEL: '基隆', TWTXG: '台中',
  HKHKG: '香港', CNSZX: '深圳', CNXMN: '廈門',
  KRPUS: '釜山', KRINC: '仁川',
  JPTYO: '東京', JPUKB: '神戶', JPYOK: '橫濱',
  SGSIN: '新加坡', THLCH: '林查班', IDJKT: '雅加達', PHMNL: '馬尼拉',
};
const zh = (code: string): string => PORT_ZH[code] ?? code;

/* 前一外國港 → 到高雄的估計航程天數（無真實逐日航跡時的合理佈局；未來可用
   /ships/{code}/track 的實際日期取代）。 */
const GAP_DAYS: Record<string, number> = {
  HKHKG: 1, CNSZX: 1, CNXMN: 1,
  KRPUS: 2, KRINC: 2,
  JPTYO: 3, JPUKB: 3, JPYOK: 3,
  SGSIN: 4, THLCH: 4, IDJKT: 4, PHMNL: 4,
};

const SRC_SET = new Set(['who', 'cdc', 'news']);
const asSource = (s: string): EpidemicIntel['source'] =>
  (SRC_SET.has(s) ? s : 'news') as EpidemicIntel['source'];

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));

/* risk_level + score(0..1) → 前端目標分數帶（scoreVessel 由 factors 重算 tier，
   紅≥80 / 橙≥60 / 黃≥40 / 綠<40，故 factors 反推到對應帶內）。 */
function targetScore(level: string, score: number): number {
  const s = clamp(Math.round((score ?? 0) * 100));
  switch (level) {
    case 'critical': return clamp(Math.max(80, s), 80, 100);
    case 'high': return clamp(s < 60 ? 68 : s, 60, 79);
    case 'medium': return clamp(s < 40 ? 48 : s, 40, 59);
    default: return clamp(Math.min(s, 39), 0, 39);
  }
}

/* 三分項反推：來源強度領頭（+k），靠港天數/距離因子（−k），加權和恰為 target
   → scoreVessel 一定落在正確 tier，且三格數值有意義差異（疫情風險由「來源」主導）。 */
function factorsFor(target: number): EpidemicFactors {
  const k = Math.min(12, target, 100 - target);
  return {
    sourceStrength: clamp(target + k),
    dwellDays: clamp(target - k),
    distanceFactor: clamp(target - k),
  };
}

const TIER = (target: number): { zh: string; action: string } =>
  target >= 80 ? { zh: '紅', action: '禁止登輪' }
    : target >= 60 ? { zh: '橙', action: '限制登輪' }
      : target >= 40 ? { zh: '黃', action: '加強防護' }
        : { zh: '綠', action: '正常' };

const ADVICE: Record<string, string[]> = {
  紅: ['禁止一般登輪', '僅檢疫登輪 全套 PPE', '接觸名單即時建檔', '離船 14d 健康管理'],
  橙: ['登輪限縮檢疫+領航', 'N95 + 面罩', '接觸名單建檔', '離船 14d 自主管理'],
  黃: ['加強體溫量測', '手部消毒', '接觸名單建檔'],
  綠: ['例行體溫量測', '手部消毒'],
};

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function mmdd(d: Date): string { return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function toVessel(a: any): EpidemicVessel {
  const level = String(a.risk_level ?? 'low');
  const target = targetScore(level, Number(a.score));
  const factors = factorsFor(target);
  const tier = TIER(target);
  const prev = String(a.prev_port ?? '');
  const gap = clamp(GAP_DAYS[prev] ?? 2, 1, WINDOW_DAYS - 1);
  const foreignDay = clamp(WINDOW_DAYS - gap, 1, WINDOW_DAYS - 1);
  const originName = prev ? zh(prev) : '—';

  const ports: EpidemicPort[] = [];
  if (prev) ports.push({ name: originName, dayIn: foreignDay, dayOut: foreignDay });
  ports.push({ name: '高雄', dayIn: WINDOW_DAYS, dayOut: WINDOW_DAYS, berthed: true });

  const matches: any[] = Array.isArray(a.matched_outbreaks) ? a.matched_outbreaks : [];
  const events: EpidemicEvent[] = matches.map((m, i) => ({
    id: `${a.ship_code}_e${i}`,
    port: zh(String(m.port ?? prev)),
    day: foreignDay,                 // 落在前一港停靠日 → rose 命中
    source: asSource(String(m.source ?? 'news')),
    label: String(m.disease ?? '疫情通報'),
  }));

  const intel: EpidemicIntel[] = matches.length
    ? matches.map((m) => ({
        source: asSource(String(m.source ?? 'news')),
        text: `${zh(String(m.port ?? prev))} · ${m.disease ?? ''} ${m.report_date ?? ''}`.trim(),
        hit: true,
      }))
    : [{ source: 'who', text: `${originName}沿途無通報`, hit: false }];

  return {
    id: String(a.ship_code),
    name: String(a.ship_name ?? a.ship_code),
    factors,
    ports,
    events,
    intel,
    advice: ADVICE[tier.zh] ?? ADVICE['綠'],
    sms: `${a.ship_name ?? a.ship_code} 抵高雄${target} · ${tier.zh}級 · ${tier.action}`,
  };
}

/* pipeline：沿用 mock 五階段版面，套上可得的真實計數。 */
function pipelineFrom(mockPipe: EpidemicPipelineStage[], fleet: EpidemicVessel[]): EpidemicPipelineStage[] {
  const hitShips = fleet.filter((v) => v.events.length).length;
  return mockPipe.map((st) => {
    if (st.key === 'track') return { ...st, count: String(fleet.length) };
    if (st.key === 'match') return { ...st, count: String(hitShips), run: hitShips > 0 };
    return { ...st };
  });
}

export function createEpidemicProvider(
  base: string = (import.meta as any).env?.VITE_EPIDEMIC_API ?? 'http://127.0.0.1:8300',
): Provider<EpidemicSnapshot> & { base: string } {
  let live = false; // 最近一次 snapshot 是否真的取到 live 資料（chip 據此如實顯示）
  return {
    base,
    get source(): Source { return live ? 'live' : 'mock'; },
    async snapshot(): Promise<EpidemicSnapshot> {
      const mock = structuredClone(epidemicMock as EpidemicSnapshot);
      try {
        const r = await fetch(`${base}/assessments`);
        if (!r.ok) throw new Error(`assessments HTTP ${r.status}`);
        const d = await r.json();
        const rows: any[] = Array.isArray(d?.assessments) ? d.assessments : [];
        const fleet = rows.map(toVessel);
        if (!fleet.length) throw new Error('assessments 為空 → 退 mock');

        const gen = d?.generated_at ? new Date(d.generated_at) : new Date();
        const start = new Date(gen.getTime() - WINDOW_DAYS * 86400000);

        live = true;
        return {
          timeRange: { startDate: mmdd(start), endDate: mmdd(gen), startDay: 0, now: WINDOW_DAYS },
          pipeline: pipelineFrom(mock.pipeline, fleet),
          fleet,
          inflowPool: mock.inflowPool, // 模擬偵測為展示裝置，沿用 mock
        };
      } catch {
        live = false;                 // 後端不在/無資料 → 整份 mock，chip 維持 mock，demo 不掛
        return mock;
      }
    },
  };
}

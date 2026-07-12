/* Policy live provider — 綜合對話模式打真後端 rag-agent。
   snapshot() 仍回 mock 收件匣（那是 demo 展示，後端無「情報收件匣」概念）；
   chat() 呼叫 POST /api/chat，把回答的 [ev_xxx] 標記轉成 cite span、evidence_items 映射成來源。
   後端不在時由呼叫端（policy screen）fallback 回罐頭訊息，不影響 demo。 */
import type {
  PolicyBrief, PolicyChatMsg, PolicyChatResult, PolicyReportResult,
  PolicyReportTemplate, PolicySnapshot, PolicySource, Provider,
} from '../types';
import policyMock from '../mock/policy.json';

/* live 晨報置頂，取代 mock 的 daily 類範例；保留突發/政策範例（那兩類尚未 live）。 */
function mergeLiveBriefs(mockBriefs: PolicyBrief[], live: PolicyBrief[]): PolicyBrief[] {
  return [...live, ...mockBriefs.filter((b) => b.type !== 'daily')];
}

/* source_type → iMarine 右欄五類分類標籤 */
const CAT_BY_TYPE: Record<string, string> = {
  regulation: '航港法令',
  news: '海運焦點新聞',
  alt_energy: '替代能源專區',
  uploaded: '自建知識庫',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 把後端回答（純文字，含 [ev_xxx] 引用標記）轉成右欄可連動的 cite span HTML。
   先跳脫再替換：使用者/模型輸出一律不當 HTML 執行，僅注入我們自己的 cite span。 */
function renderAnswer(answer: string, noById: Map<string, number>): string {
  let html = escapeHtml(answer);
  html = html.replace(/\[(ev_\d+)\]/g, (_m, id: string) => {
    const no = noById.get(id);
    return no ? `<span class="cite" data-src="${no}">${no}</span>` : '';
  });
  return html.replace(/\n/g, '<br>');
}

export function createPolicyProvider(
  base: string = (import.meta as any).env?.VITE_POLICY_API ?? 'http://127.0.0.1:8100',
): Provider<PolicySnapshot> & {
  base: string;
  chat(message: string, history: PolicyChatMsg[]): Promise<PolicyChatResult>;
  knowledgeBases(): Promise<PolicySource[]>;
  reportTemplates(): Promise<PolicyReportTemplate[]>;
  report(prompt: string, sourceIds: string[], templateId: string): Promise<PolicyReportResult>;
  refreshNews(): Promise<PolicyBrief[]>;
} {
  return {
    source: 'live',
    base,
    async snapshot() {
      // 收件匣情報卡優先取後端 live 生成（目前為每日晨報）；後端不在則整份回 mock。
      const snap = structuredClone(policyMock as PolicySnapshot);
      try {
        const r = await fetch(base + '/api/policy/briefs');
        if (r.ok) {
          const d = await r.json();
          const live: PolicyBrief[] = d.briefs ?? [];
          if (live.length) snap.briefs = mergeLiveBriefs(snap.briefs, live);
        }
      } catch { /* 後端不在 → 維持全 mock，demo 不掛 */ }
      return snap;
    },
    async refreshNews() {
      const r = await fetch(base + '/api/policy/refresh', { method: 'POST' });
      if (!r.ok) throw new Error(`refresh HTTP ${r.status}`);
      const d = await r.json();
      return (d.briefs ?? []) as PolicyBrief[];
    },
    async knowledgeBases() {
      const r = await fetch(base + '/api/sources');
      if (!r.ok) throw new Error(`sources HTTP ${r.status}`);
      const rows: any[] = await r.json();
      return rows.map((s, i) => ({
        no: i + 1,
        name: s.source_name ?? s.source_id,
        cat: CAT_BY_TYPE[s.source_type] ?? s.source_type ?? '其他',
        date: `${s.chunk_count ?? 0} 段`,      // 以 chunk 數表示知識庫規模
        checked: s.enabled ?? true,
        sourceId: s.source_id,                 // 產報告選來源用
      }));
    },
    async reportTemplates() {
      const r = await fetch(base + '/api/report/templates');
      if (!r.ok) throw new Error(`templates HTTP ${r.status}`);
      return await r.json();
    },
    async report(prompt, sourceIds, templateId) {
      const r = await fetch(base + '/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, source_ids: sourceIds, template: templateId }),
      });
      if (!r.ok) throw new Error(`report HTTP ${r.status}`);
      const d = await r.json();

      // 報告引用來源：以 source_list 順序編號，供各章節 [ev_xxx] 對齊 cite
      const noById = new Map<string, number>();
      const sources: PolicySource[] = (d.source_list ?? []).map((s: any, i: number) => {
        noById.set(s.evidence_id, i + 1);
        return {
          no: i + 1,
          name: s.locator ? `${s.source_name}｜${s.locator}` : s.source_name,
          cat: '報告來源',
          date: s.date ? String(s.date).slice(0, 10) : '',
          checked: true,
          sourceId: s.source_id,
        };
      });
      const sections = (d.sections ?? []).map((sec: any) => ({
        key: sec.key,
        label: sec.label,
        html: renderAnswer(sec.text ?? '', noById),
        citations: sec.citations ?? [],
      }));
      return {
        reportId: d.report_id ?? '',
        topic: d.topic ?? prompt,
        templateId: d.template_id ?? templateId,
        sections,
        sources,
        grounding: Math.round((d.citation_coverage ?? 0) * 100),
        provider: d.provider ?? '',
        model: d.model ?? '',
      };
    },
    async chat(message, history) {
      const r = await fetch(base + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      if (!r.ok) throw new Error(`chat HTTP ${r.status}`);
      const d = await r.json();

      const items: any[] = d.evidence_package?.evidence_items ?? [];
      const noById = new Map<string, number>();
      const sources: PolicySource[] = items.map((it, i) => {
        noById.set(it.evidence_id, i + 1);
        const loc = it.locator?.article || it.locator?.section || '';
        return {
          no: i + 1,
          name: loc ? `${it.title}｜${loc}` : (it.title ?? it.source_id),
          cat: CAT_BY_TYPE[it.source_type] ?? it.source_type ?? '其他',
          date: it.published_at ? String(it.published_at).slice(0, 10) : '',
          checked: true,
          sourceId: it.source_id,
        };
      });

      return {
        answerHtml: renderAnswer(d.answer ?? '', noById),
        answerText: d.answer ?? '',
        sources,
        grounding: Math.round((d.citation_coverage ?? 0) * 100),
        provider: d.provider ?? '',
        model: d.model ?? '',
      };
    },
  };
}

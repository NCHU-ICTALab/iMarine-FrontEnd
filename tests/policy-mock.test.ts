import { describe, it, expect } from 'vitest';
import { createMockExchange } from '../src/data/exchange/mock';

const CATS = ['全球航運指數', '台灣數據統計', '海運焦點新聞', '航港法令', '替代能源專區'];

describe('policy mock 契約', () => {
  it('briefs 7 條、inflow 2 條、globalQa 2 組', async () => {
    const s = await createMockExchange().policy.snapshot();
    expect(s.briefs).toHaveLength(7);
    expect(s.inflow).toHaveLength(2);
    expect(s.globalQa).toHaveLength(2);
  });
  it('主秀紅海為 incident 雙案例；NZF 為 policy 五段；晨報 watch 帶 goto', async () => {
    const s = await createMockExchange().policy.snapshot();
    const [redsea, nzf, daily] = s.briefs;
    expect(redsea.type).toBe('incident');
    if (redsea.type === 'incident') expect(redsea.cases).toHaveLength(2);
    expect(nzf.type).toBe('policy');
    if (nzf.type === 'policy') expect(nzf.sections).toHaveLength(5);
    expect(daily.type).toBe('daily');
    if (daily.type === 'daily') expect(daily.watch.goto).toBe('pol-nzf');
  });
  it('所有來源 cat 皆屬 iMarine 五類；globalQa 引用佔位可在全來源名稱中解析', async () => {
    const s = await createMockExchange().policy.snapshot();
    const all = [...s.briefs, ...s.inflow];
    const names = new Set(all.flatMap((b) => b.sources.map((x) => x.name)));
    for (const b of all) for (const src of b.sources) expect(CATS).toContain(src.cat);
    for (const qa of s.globalQa) {
      for (const m of qa.a.matchAll(/\{\{c:([^}]+)\}\}/g)) expect(names.has(m[1])).toBe(true);
    }
  });
  it('每則簡報內文的 data-src 引用皆能對應到該簡報自身的 sources 編號', async () => {
    const s = await createMockExchange().policy.snapshot();
    const all = [...s.briefs, ...s.inflow];
    for (const b of all) {
      const sourceNos = new Set(b.sources.map((x) => x.no));
      const cites = new Set<number>();
      const collect = (html: string | null | undefined) => {
        if (!html) return;
        for (const m of html.matchAll(/data-src="(\d+)"/g)) cites.add(Number(m[1]));
      };
      if (b.type === 'incident') {
        collect(b.summary);
        collect(b.impact);
        for (const c of b.cases) cites.add(c.cite);
      } else if (b.type === 'policy') {
        for (const sec of b.sections) collect(sec.html);
      } else {
        for (const it of b.items) cites.add(it.cite);
      }
      for (const qa of b.qa) collect(qa.a);
      for (const no of cites) expect(sourceNos.has(no)).toBe(true);
    }
  });
});

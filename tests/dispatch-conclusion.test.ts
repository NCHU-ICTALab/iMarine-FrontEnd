import { describe, it, expect } from 'vitest';
import { parseConclusion } from '../src/screens/dispatch/conclusion';

describe('parseConclusion', () => {
  it('stop 標記轉 <em>、add 標記轉 <u>', () => {
    expect(parseConclusion('A — {{stop:橋式機停工}}，{{add:綁解纜加派 2 員}}')).toBe(
      'A — <em>橋式機停工</em>，<u>綁解纜加派 2 員</u>',
    );
  });
  it('無標記時原樣返回', () => {
    expect(parseConclusion('全作業線正常運轉')).toBe('全作業線正常運轉');
  });
  it('同型標記可出現多次、解析後無殘留大括號', () => {
    const out = parseConclusion('{{stop:甲}}與{{stop:乙}}');
    expect(out).toBe('<em>甲</em>與<em>乙</em>');
    expect(out).not.toContain('{{');
  });
});

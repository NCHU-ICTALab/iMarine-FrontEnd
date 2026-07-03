import { describe, it, expect } from 'vitest';
import { parseHash } from '../src/shell/router';

const ids = ['hero', 'carbon', 'policy', 'twin', 'dispatch', 'epidemic', 'alert'];

describe('parseHash', () => {
  it('maps #/carbon to carbon', () => expect(parseHash('#/carbon', ids)).toBe('carbon'));
  it('falls back to hero on empty', () => expect(parseHash('', ids)).toBe('hero'));
  it('falls back to hero on unknown', () => expect(parseHash('#/nope', ids)).toBe('hero'));
  it('ignores missing slash', () => expect(parseHash('#carbon', ids)).toBe('hero'));
});

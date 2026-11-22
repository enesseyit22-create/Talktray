import { describe, expect, it } from 'vitest';

import { foldText, matchesQuery } from '@/lib/search';

describe('search', () => {
  it('folds Turkish letters both ways', () => {
    expect(foldText('IŞIK İstanbul Çağrı Göz Üzüm')).toBe('isik istanbul cagri goz uzum');
    expect(matchesQuery(['Işık al'], 'isik')).toBe(true);
    expect(matchesQuery(['isik al'], 'ışık')).toBe(true);
    expect(matchesQuery(['İLAÇ'], 'ilac')).toBe(true);
  });

  it('ignores apostrophes and case', () => {
    expect(matchesQuery(["Ahmet'i ara"], 'ahmeti')).toBe(true);
    expect(matchesQuery(['Call MOM'], 'mom')).toBe(true);
  });

  it('needs every word, in any field', () => {
    expect(matchesQuery(['Süt al', null, 'Market'], 'market süt')).toBe(true);
    expect(matchesQuery(['Süt al'], 'süt ekmek')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesQuery(['anything'], '   ')).toBe(true);
  });

  it('keeps other scripts', () => {
    expect(matchesQuery(['牛乳を買う'], '牛乳')).toBe(true);
    expect(matchesQuery(['우유 사기'], '우유')).toBe(true);
  });
});

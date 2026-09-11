import { describe, expect, it } from 'vitest';
import { allKeywordWords, localeIds, locales, normalize } from '../src/lang/index';

describe('locales', () => {
  it('keywords carry no diacritics and are lowercase', () => {
    for (const id of localeIds) {
      for (const [k, v] of Object.entries(locales[id].keywords)) {
        expect(normalize(v), `${id}.${k}`).toBe(v);
      }
    }
  });
  it('keywords are unique within a locale', () => {
    for (const id of localeIds) {
      const words = Object.values(locales[id].keywords);
      expect(new Set(words).size).toBe(words.length);
    }
  });
  it('normalize strips diacritics and case', () => {
    expect(normalize('Vľavo')).toBe('vlavo');
    expect(normalize('POLOŽ')).toBe('poloz');
    expect(normalize('příkaz')).toBe('prikaz');
  });
  it('every locale defines every message key of sk', () => {
    for (const id of localeIds) {
      expect(Object.keys(locales[id].runtime).sort()).toEqual(Object.keys(locales.sk.runtime).sort());
      expect(Object.keys(locales[id].ui).sort()).toEqual(Object.keys(locales.sk.ui).sort());
    }
  });
  it('allKeywordWords covers the two-word forms split', () => {
    const all = allKeywordWords();
    expect(all.has('nie')).toBe(true);
    expect(all.has('not')).toBe(true);
  });
});

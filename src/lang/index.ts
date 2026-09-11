import type { Keyword, Locale, LocaleId } from './types';
import { sk } from './sk';
import { cs } from './cs';
import { en } from './en';

export type { Keyword, Locale, LocaleId } from './types';

export const locales: Record<LocaleId, Locale> = { sk, cs, en };
export const localeIds: LocaleId[] = ['sk', 'cs', 'en'];
export const defaultLocale: LocaleId = 'sk';

export function isLocaleId(s: string): s is LocaleId {
  return s === 'sk' || s === 'cs' || s === 'en';
}

/** Strip diacritics and lowercase, so `Vľavo` matches `vlavo`. */
export function normalize(word: string): string {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Every localized keyword word across all locales, normalized. Used to validate identifiers. */
export function allKeywordWords(): Set<string> {
  const out = new Set<string>();
  for (const id of localeIds) {
    for (const v of Object.values(locales[id].keywords)) {
      for (const w of v.split(' ')) out.add(normalize(w));
    }
  }
  return out;
}

/** Which locale owns a normalized keyword word, if any (first match wins). */
export function keywordOwner(word: string): LocaleId | undefined {
  for (const id of localeIds) {
    for (const v of Object.values(locales[id].keywords)) {
      if (v.split(' ').includes(word)) return id;
    }
  }
  return undefined;
}

export function keywordList(locale: Locale): Keyword[] {
  return Object.keys(locale.keywords) as Keyword[];
}

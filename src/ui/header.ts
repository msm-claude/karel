// The shared header: the brand plus the SK / CS / EN switch. Every page mounts it.
// The locale lives in localStorage (`karel.locale`) and travels in the URL only when a
// link is shared: `?l=` on the landing and the sheet, `#l=` in the app, whose state is a hash.
import { defaultLocale, isLocaleId, localeIds, type LocaleId } from '../lang/index';

export const LOCALE_KEY = 'karel.locale';

/** URL param `l` (query first, then hash) > localStorage > sk. A URL param sticks. */
export function resolveLocale(): LocaleId {
  const fromUrl = new URLSearchParams(location.search).get('l') ?? new URLSearchParams(location.hash.slice(1)).get('l');
  if (fromUrl && isLocaleId(fromUrl)) {
    storeLocale(fromUrl);
    return fromUrl;
  }
  const stored = localStorage.getItem(LOCALE_KEY);
  return stored && isLocaleId(stored) ? stored : defaultLocale;
}

export function storeLocale(id: LocaleId): void {
  localStorage.setItem(LOCALE_KEY, id);
  document.documentElement.lang = id;
}

/**
 * Fill `#lang` with one button per locale. `onChange` runs after a click stored the new
 * locale. Returns a setter for when the page switches on its own (a file header, say).
 */
export function mountLangSwitch(current: LocaleId, onChange: (id: LocaleId) => void): (id: LocaleId) => void {
  const box = document.getElementById('lang')!;
  box.innerHTML = '';
  const buttons: [LocaleId, HTMLButtonElement][] = [];
  const paint = () => {
    for (const [id, b] of buttons) b.classList.toggle('on', id === current);
  };
  const set = (id: LocaleId) => {
    current = id;
    storeLocale(id);
    paint();
  };
  for (const id of localeIds) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = id.toUpperCase();
    b.addEventListener('click', () => {
      if (id === current) return;
      set(id);
      onChange(id);
    });
    box.appendChild(b);
    buttons.push([id, b]);
  }
  document.documentElement.lang = current;
  paint();
  return set;
}

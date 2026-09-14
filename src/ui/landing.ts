// Landing page: one room drawn by the app's own renderer, showing what the sample program leaves
// behind. The copy and the sample program follow the shared language switch.
import { runToEnd } from '../core/interp';
import { parse } from '../core/parser';
import { translate } from '../core/translate';
import { emptyWorld } from '../core/world';
import { locales, type LocaleId } from '../lang/index';
import { mountLangSwitch, resolveLocale } from './header';
import { landingText } from './landing.text';
import { renderWorld } from './render';

// Slovak is the source; the other languages come out of translate(), the comment out of the copy table.
const BODY = `prikaz murik
  opakuj 4 krat
    poloz
    krok
  koniec
koniec

murik
vlavo
oznac`;

const canvas = document.getElementById('cv') as HTMLCanvasElement;
const pre = document.getElementById('src')!;

function apply(id: LocaleId): void {
  const s = landingText[id];
  const loc = locales[id];
  document.title = s['title']!;
  document.querySelector<HTMLMetaElement>('meta[name=description]')!.content = s['description']!;
  for (const el of document.querySelectorAll<HTMLElement>('[data-s]')) {
    const text = s[el.dataset['s']!];
    if (text !== undefined) el.innerHTML = text;
  }
  const kw = new Set(Object.values(loc.keywords).flatMap((w) => w.split(' ')));
  pre.innerHTML = [s['comment']!, ...translate(BODY, locales.sk, loc).split('\n')]
    .map((line) => {
      if (line.startsWith('#')) return `<i>${line}</i>`;
      return line.replace(/[a-z]+/g, (w) => (kw.has(w) ? `<b>${w}</b>` : w));
    })
    .join('\n');
}

const locale = resolveLocale();
apply(locale);
mountLangSwitch(locale, apply);

const start = emptyWorld(7, 5);
start.karel = { x: 1, y: 3, dir: 0 };
const world = runToEnd(parse(BODY, locales.sk), start).world;
const draw = () => renderWorld(canvas, world, 0, undefined, { levels: 2 });
new ResizeObserver(draw).observe(canvas);
draw();

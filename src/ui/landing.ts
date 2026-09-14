// Landing page: one room drawn by the app's own renderer, showing what the sample program leaves behind.
import { runToEnd } from '../core/interp';
import { parse } from '../core/parser';
import { emptyWorld } from '../core/world';
import { locales } from '../lang/index';
import { renderWorld } from './render';

const SRC = `# Karel postaví múrik a označí, kde skončil
prikaz murik
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
const kw = new Set(Object.values(locales.sk.keywords).flatMap((w) => w.split(' ')));
pre.innerHTML = SRC.split('\n')
  .map((line) => {
    if (line.startsWith('#')) return `<i>${line}</i>`;
    return line.replace(/[a-z]+/g, (w) => (kw.has(w) ? `<b>${w}</b>` : w));
  })
  .join('\n');

const start = emptyWorld(7, 5);
start.karel = { x: 1, y: 3, dir: 0 };
const world = runToEnd(parse(SRC, locales.sk), start).world;
const draw = () => renderWorld(canvas, world, 0, undefined, { levels: 2 });
new ResizeObserver(draw).observe(canvas);
draw();

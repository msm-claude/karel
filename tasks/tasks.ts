// The tasks page: renders tasks.json with the prose of the chosen language (strings.<lang>.json),
// draws every map with the app's renderer, links each map into the app. No state, no solutions:
// this is the assignment sheet, nothing more.
import { encodeProgram } from '../src/core/encode';
import { translate } from '../src/core/translate';
import { locales, type LocaleId } from '../src/lang/index';
import { mountLangSwitch, resolveLocale } from '../src/ui/header';
import { OVERWORLD, renderWorld } from '../src/ui/render';
import cs from './strings.cs.json';
import en from './strings.en.json';
import sk from './strings.sk.json';
import data from './tasks.json';
import { mapCode, toWorld, type SchoolWorld, type Strings, type Task, type Tasks } from './world';

const DATA = data as unknown as Tasks;
const STRINGS: Record<LocaleId, Strings> = { sk, cs, en } as unknown as Record<LocaleId, Strings>;
const APP = new URL('../app/', location.href).href;

let locale = resolveLocale();
let S = STRINGS[locale];

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const anchor = (id: string) => 't' + id.replace('.', '-');
const ui = (key: string, n?: number) => (S.ui[key] ?? key).replace('{n}', String(n));
/** programs in the data are Slovak; the sheet and the app link show them in the chosen language */
const program = (t: Task) => translate(t.program!, locales.sk, locales[locale]);
const link = (w: SchoolWorld, p?: string) => `${APP}#m=${mapCode(w)}${p ? `&p=${p}` : ''}&l=${locale}`;

// canvases are drawn after the HTML is in the DOM; this map remembers what goes where
const canvases = new Map<string, SchoolWorld>();
let canvasSeq = 0;
function canvas(w: SchoolWorld): string {
  const id = `map${++canvasSeq}`;
  canvases.set(id, w);
  return `<div class="mapbox"><canvas class="map" id="${id}"></canvas><button class="cp" type="button" data-code="${mapCode(w)}" title="${ui('copyMapTitle')}">${ui('copy')}</button></div>`;
}

function codeBlock(code: string): string {
  return `<div class="code"><pre>${esc(code)}</pre><button class="cp" type="button" title="${ui('copyProgramTitle')}">${ui('copy')}</button></div>`;
}

function opener(t: Task, w: SchoolWorld, label: string, v: number): string {
  const data = `data-id="${t.id}" data-v="${v}"`;
  if (t.program) return `<button class="dl open" ${data} title="${ui('openTitle')}">${label}</button>`;
  return `<a class="dl" href="${link(w)}" target="_blank" rel="noopener" title="${ui('openEmptyTitle')}">${label}</a>`;
}

function renderCard(t: Task): string {
  const s = S.tasks[t.id]!;
  const type = t.type ?? 'code';
  const typeLabel = type === 'trace' ? ui('typeTrace') : type === 'bug' ? ui('typeBug') : '';
  const tags = `<span class="tag">${s.concept}</span>` + (typeLabel ? `<span class="tag type">${typeLabel}</span>` : '');
  const many = t.maps.length > 1;
  const worlds = t.maps
    .map((m, i) => {
      const n = many ? `${ui('map', i + 1)} · ` : '';
      const label = i === 0 ? ui('open') : ui('openMap', i + 1);
      const post =
        type === 'trace'
          ? `<div class="world"><div class="lbl">${n}${ui('post')}</div><div class="q" style="width:320px;height:200px">?</div></div>`
          : `<div class="world"><div class="lbl">${n}${ui('post')}</div>${canvas(m.post)}</div>`;
      return `<div class="pair${i ? ' map' : ''}"><div class="world"><div class="lbl">${n}${ui('pre')}</div>${canvas(m.pre)}${opener(t, m.pre, label, i)}</div>${post}</div>`;
    })
    .join('');
  let body = '';
  if (many) body += `<div class="note">${ui('manyMaps', t.maps.length)}</div>`;
  if (t.program) body += codeBlock(program(t));
  return `<div class="task" id="${anchor(t.id)}" data-id="${t.id}">
    <header><span class="num">${t.id}</span><h3>${s.title}</h3>${tags}</header>
    <div>${s.text}</div>
    ${body}
    <div class="worlds">${worlds}</div>
    ${s.hint ? `<details><summary>${ui('hint')}</summary><div class="why">${s.hint}</div></details>` : ''}
  </div>`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function render(): void {
  document.title = ui('pageTitle');
  for (const el of document.querySelectorAll<HTMLElement>('[data-s]')) el.innerHTML = ui(el.dataset['s']!);
  canvases.clear();
  canvasSeq = 0;
  const byId = new Map(DATA.tasks.map((t) => [t.id, t]));
  let html = '';
  let toc = '<ol>';
  for (const lv of DATA.levels) {
    const s = S.levels[String(lv.id)]!;
    html += `<h2 id="l${lv.id}">${s.title}</h2><p>${s.intro}</p>`;
    if (s.concept) html += `<div class="box"><h4>${ui('newThing')}</h4><pre>${esc(s.concept)}</pre></div>`;
    const tasks = DATA.tasks.filter((t) => t.level === lv.id);
    toc += `<li><a href="#l${lv.id}">${esc(s.title)}</a><ol>${tasks.map((t) => `<li><a href="#${anchor(t.id)}">${t.id} ${esc(S.tasks[t.id]!.title)}</a></li>`).join('')}</ol></li>`;
    for (const t of tasks) html += renderCard(t);
  }
  document.getElementById('content')!.innerHTML = html;
  document.getElementById('toc')!.innerHTML = toc + '</ol>';
  for (const [id, w] of canvases) {
    const el = document.getElementById(id) as HTMLCanvasElement | null;
    if (el) {
      const top = Math.max(1, ...Object.values(w.bricks ?? {})) + 1; // room for the stacks plus Karel's head
      renderWorld(el, toWorld(w), 0, OVERWORLD, { levels: top });
    }
  }

  document.querySelectorAll<HTMLButtonElement>('button.dl.open').forEach((b) =>
    b.addEventListener('click', async () => {
      const t = byId.get(b.dataset['id']!)!;
      const pre = t.maps[Number(b.dataset['v'])]!.pre;
      window.open(link(pre, await encodeProgram(program(t))), '_blank', 'noopener');
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('.cp').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await copyText(b.dataset['code'] ?? b.previousElementSibling!.textContent ?? '');
      b.textContent = ui(ok ? 'copied' : 'copyFailed');
      b.classList.toggle('ok', ok);
      setTimeout(() => {
        b.textContent = ui('copy');
        b.classList.remove('ok');
      }, 1500);
    }),
  );
}

render();
mountLangSwitch(locale, (id) => {
  locale = id;
  S = STRINGS[id];
  render();
});

// the "Obsah" link shows once the table of contents has scrolled out of view
const up = document.querySelector<HTMLElement>('.up')!;
new IntersectionObserver(([e]) => (up.hidden = e!.isIntersecting)).observe(document.getElementById('toc')!);

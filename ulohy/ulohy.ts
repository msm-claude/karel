// The tasks page: renders tasks.json, draws every map with the app's renderer, links each map
// into the app. No state, no solutions: this is the assignment sheet, nothing more.
import { encodeProgram } from '../src/core/encode';
import { OVERWORLD, renderWorld } from '../src/ui/render';
import data from './tasks.json';
import { mapCode, toWorld, type SchoolWorld, type Task, type Tasks } from './world';

const DATA = data as unknown as Tasks;
const APP = new URL('../app/', location.href).href;
const TYPE_LABEL: Record<string, string> = { trace: 'hádanka', bug: 'chyba' };

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const anchor = (id: string) => 't' + id.replace('.', '-');
const link = (w: SchoolWorld, program?: string) => `${APP}#m=${mapCode(w)}${program ? `&p=${program}` : ''}&l=sk`;

// canvases are drawn after the HTML is in the DOM; this map remembers what goes where
const canvases = new Map<string, SchoolWorld>();
let canvasSeq = 0;
function canvas(w: SchoolWorld): string {
  const id = `map${++canvasSeq}`;
  canvases.set(id, w);
  return `<div class="mapbox"><canvas class="map" id="${id}"></canvas><button class="cp" type="button" data-code="${mapCode(w)}" title="Skopíruje kód mapy; v Karlovi ho vložíš v záložke Miestnosť">Kopírovať</button></div>`;
}

function codeBlock(code: string): string {
  return `<div class="code"><pre>${esc(code)}</pre><button class="cp" type="button" title="Skopíruje program do schránky">Kopírovať</button></div>`;
}

function opener(t: Task, w: SchoolWorld, label: string, v: number): string {
  const data = `data-id="${t.id}" data-v="${v}"`;
  if (t.program) return `<button class="dl open" ${data} title="Otvorí Karla s mapou a programom">${label}</button>`;
  return `<a class="dl" href="${link(w)}" target="_blank" rel="noopener" title="Otvorí Karla s mapou PRED a prázdnym programom">${label}</a>`;
}

function renderCard(t: Task): string {
  const type = t.type ?? 'code';
  const tags = `<span class="tag">${t.concept}</span>` + (TYPE_LABEL[type] ? `<span class="tag type">${TYPE_LABEL[type]}</span>` : '');
  const many = t.maps.length > 1;
  const worlds = t.maps
    .map((m, i) => {
      const n = many ? `Mapa ${i + 1} · ` : '';
      const label = i === 0 ? 'Otvor v Karlovi' : `Otvor mapu ${i + 1}`;
      const post =
        type === 'trace'
          ? `<div class="world"><div class="lbl">${n}PO</div><div class="q" style="width:320px;height:200px">?</div></div>`
          : `<div class="world"><div class="lbl">${n}PO</div>${canvas(m.post)}</div>`;
      return `<div class="pair${i ? ' map' : ''}"><div class="world"><div class="lbl">${n}PRED</div>${canvas(m.pre)}${opener(t, m.pre, label, i)}</div>${post}</div>`;
    })
    .join('');
  let body = '';
  if (many) body += `<div class="note">Program musí zbehnúť bez zmeny na všetkých ${t.maps.length} mapách. Vyskúšaj ho na každej.</div>`;
  if (t.program) body += codeBlock(t.program);
  return `<div class="task" id="${anchor(t.id)}" data-id="${t.id}">
    <header><span class="num">${t.id}</span><h3>${t.title}</h3>${tags}</header>
    <div>${t.text}</div>
    ${body}
    <div class="worlds">${worlds}</div>
    ${t.hint ? `<details><summary>Nápoveda</summary><div class="why">${t.hint}</div></details>` : ''}
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
  const byId = new Map(DATA.tasks.map((t) => [t.id, t]));
  let html = '';
  let toc = '<ol>';
  for (const lv of DATA.levels) {
    html += `<h2 id="l${lv.id}">${lv.title}</h2><p>${lv.intro}</p>`;
    if (lv.concept) html += `<div class="box"><h4>Nová vec</h4><pre>${esc(lv.concept)}</pre></div>`;
    const tasks = DATA.tasks.filter((t) => t.level === lv.id);
    toc += `<li><a href="#l${lv.id}">${esc(lv.title)}</a><ol>${tasks.map((t) => `<li><a href="#${anchor(t.id)}">${t.id} ${esc(t.title)}</a></li>`).join('')}</ol></li>`;
    for (const t of tasks) html += renderCard(t);
  }
  document.getElementById('content')!.innerHTML = html;
  document.getElementById('toc')!.innerHTML = toc + '</ol>';
  for (const [id, w] of canvases) {
    const el = document.getElementById(id) as HTMLCanvasElement | null;
    if (el) {
      const top = Math.max(1, ...Object.values(w.bricks ?? {})) + 1; // room for the stacks plus Karel's head
      renderWorld(el, toWorld(w), 0, OVERWORLD, { labels: true, levels: top });
    }
  }

  document.querySelectorAll<HTMLButtonElement>('button.dl.open').forEach((b) =>
    b.addEventListener('click', async () => {
      const t = byId.get(b.dataset['id']!)!;
      const pre = t.maps[Number(b.dataset['v'])]!.pre;
      window.open(link(pre, await encodeProgram(t.program!)), '_blank', 'noopener');
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('.cp').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await copyText(b.dataset['code'] ?? b.previousElementSibling!.textContent ?? '');
      b.textContent = ok ? 'Skopírované' : 'Nepodarilo sa';
      b.classList.toggle('ok', ok);
      setTimeout(() => {
        b.textContent = 'Kopírovať';
        b.classList.remove('ok');
      }, 1500);
    }),
  );
}

render();

// The tasks page: renders tasks.json, draws every map with the app's renderer, links each map
// into the app. No state, no solutions: this is the assignment sheet, nothing more.
import { encodeProgram } from '../src/core/encode';
import { OVERWORLD, renderWorld } from '../src/ui/render';
import data from './tasks.json';
import { karelFile, mapCode, toWorld, type SchoolWorld, type Task, type Tasks } from './world';

const DATA = data as unknown as Tasks;
const APP = new URL('../', location.href).href;
const TYPE_LABEL: Record<string, string> = { manual: 'ručne', trace: 'hádanka', bug: 'chyba' };

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const anchor = (id: string) => 't' + id.replace('.', '-');
const link = (w: SchoolWorld, program?: string) => `${APP}#m=${mapCode(w)}${program ? `&p=${program}` : ''}&l=sk`;

// canvases are drawn after the HTML is in the DOM; this map remembers what goes where
const canvases = new Map<string, SchoolWorld>();
let canvasSeq = 0;
function canvas(w: SchoolWorld): string {
  const id = `map${++canvasSeq}`;
  canvases.set(id, w);
  return `<canvas class="map" id="${id}"></canvas>`;
}

function codeBlock(code: string): string {
  return `<div class="code"><pre>${esc(code)}</pre><button class="cp" type="button" title="Skopíruje program do schránky">Kopírovať</button></div>`;
}

function opener(t: Task, w: SchoolWorld, label: string, v: number): string {
  const data = `data-id="${t.id}" data-v="${v}"`;
  if (t.app === 'old') return `<button class="dl" ${data} title="Súbor pre karelrobot.cz: Menu → Načti z PC">${label}</button>`;
  if (t.program) return `<button class="dl open" ${data} title="Otvorí Karla s mapou a programom">${label}</button>`;
  return `<a class="dl" href="${link(w)}" target="_blank" rel="noopener" title="Otvorí Karla s mapou PRED a prázdnym programom">${label}</a>`;
}

function renderCard(t: Task): string {
  const type = t.type ?? 'code';
  const old = t.app === 'old';
  const tags =
    `<span class="tag">${t.concept}</span>` +
    (TYPE_LABEL[type] ? `<span class="tag type">${TYPE_LABEL[type]}</span>` : '') +
    (old ? `<span class="tag old">karelrobot.cz</span>` : '');
  const many = t.maps.length > 1;
  const openLabel = old ? 'Stiahni miestnosť' : 'Otvor v Karlovi';
  const worlds = t.maps
    .map((m, i) => {
      const n = many ? `Mapa ${i + 1} · ` : '';
      const label = i === 0 ? openLabel : old ? `Stiahni mapu ${i + 1}` : `Otvor mapu ${i + 1}`;
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
  return `<div class="card" id="${anchor(t.id)}" data-id="${t.id}">
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

function download(t: Task, pre: SchoolWorld, suffix: string): void {
  const blob = new Blob([JSON.stringify(karelFile(t, pre))], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `karel-${t.id}${suffix}.karel`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function render(): void {
  const byId = new Map(DATA.tasks.map((t) => [t.id, t]));
  let html = '';
  let toc = '';
  for (const lv of DATA.levels) {
    html += `<h2 id="l${lv.id}">${lv.title}${lv.app === 'old' ? ` <span class="tag old">karelrobot.cz</span>` : ''}</h2><p>${lv.intro}</p>`;
    if (lv.concept) html += `<div class="box"><h4>Nová vec</h4><pre>${esc(lv.concept)}</pre></div>`;
    const tasks = DATA.tasks.filter((t) => t.level === lv.id);
    toc += `<a href="#l${lv.id}" title="${tasks.length} úloh"><span class="num">${lv.id}</span> ${esc(lv.title.replace(/^Úroveň \d+: /, ''))}</a>`;
    for (const t of tasks) html += renderCard(t);
  }
  document.getElementById('content')!.innerHTML = html;
  document.getElementById('toc')!.innerHTML = toc;
  document.getElementById('concepts')!.innerHTML =
    `<tr><th>Koncept</th><th>Čo to pre dieťa znamená</th><th>Úlohy</th></tr>` +
    DATA.concepts
      .map(
        (c) =>
          `<tr><td>${c.name}</td><td>${c.desc}</td><td>${c.tasks.map((id) => `<a href="#${anchor(id)}" title="${byId.get(id)?.title ?? ''}">${id}</a>`).join(', ') || '—'}</td></tr>`,
      )
      .join('');
  const one = (extra: Partial<SchoolWorld>, label: string) => `<div>${canvas({ w: 2, h: 1, karel: [1, 1, 'E'], ...extra })} ${label}</div>`;
  document.getElementById('legend')!.innerHTML =
    one({}, 'Karel (šípka na hlave = kam pozerá)') +
    one({ bricks: { '2,1': 1 } }, 'tehla pred Karlom') +
    one({ bricks: { '2,1': 3 } }, 'stĺpik z 3 tehál') +
    one({ bricks: { '1,1': 1 } }, 'Karel stojí na tehle') +
    one({ marks: ['1,1'] }, 'Karel stojí na značke') +
    one({ blocked: ['2,1'] }, 'stena (chýbajúce políčko)');

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
  document.querySelectorAll<HTMLButtonElement>('button.dl:not(.open)').forEach((b) =>
    b.addEventListener('click', () => {
      const t = byId.get(b.dataset['id']!)!;
      const v = Number(b.dataset['v']);
      download(t, t.maps[v]!.pre, v ? `-mapa${v + 1}` : '');
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('.cp').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await copyText(b.previousElementSibling!.textContent ?? '');
      b.textContent = ok ? 'Skopírované' : 'Nepodarilo sa';
      b.classList.toggle('ok', ok);
      setTimeout(() => {
        b.textContent = 'Kopírovať';
        b.classList.remove('ok');
      }, 1500);
    }),
  );
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', () => {
      const t = document.getElementById(a.getAttribute('href')!.slice(1));
      if (t && t.tagName === 'DETAILS') (t as HTMLDetailsElement).open = true;
    }),
  );
  const totop = document.getElementById('totop')!;
  const obsah = document.getElementById('obsah')!;
  const onScroll = () => totop.classList.toggle('show', window.scrollY > obsah.offsetTop + obsah.offsetHeight);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

render();

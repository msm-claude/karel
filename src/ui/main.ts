// Page wiring: state, controls, hash links, localStorage. Everything below
// the DOM boundary lives in core/ and lang/; this file only glues.
import { decodeProgram, decodeWorld, encodeProgram, encodeWorld, parseHash } from '../core/encode';
import { parse, ParseError } from '../core/parser';
import { translate } from '../core/translate';
import { cloneWorld, emptyWorld, MAX_BRICKS, MAX_SIZE, resizeWorld, tileAt, turnRight, type World } from '../core/world';
import { allKeywordWords, defaultLocale, isLocaleId, localeIds, locales, normalize, type Locale, type LocaleId } from '../lang/index';
import { Driver } from './driver';
import { Editor } from './editor';
import { pickTile, renderWorld, type View } from './render';

const DEFAULT_ROOM = '1.10x8.2,5,0.2AB7A8A2zA5EGCAz10A10A3ABCEHI2A8ABAB9A';
const DEFAULT_PROGRAM: Record<LocaleId, string> = {
  sk: `# Karel postavi schody a oznaci vrchol
prikaz schody
  opakuj 3 krat
    poloz
    krok
  koniec
koniec

schody
oznac
`,
  cs: '',
  en: '',
};
DEFAULT_PROGRAM.cs = translate(DEFAULT_PROGRAM.sk, locales.sk, locales.cs);
DEFAULT_PROGRAM.en = translate(DEFAULT_PROGRAM.sk, locales.sk, locales.en);

const LS = { program: 'karel.program', room: 'karel.room', locale: 'karel.locale', view: 'karel.view', speed: 'karel.speed' };

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

// ---- state, resolved synchronously before anything can draw (no flash of the demo room)

const hashParams = parseHash(location.hash);
const wantedLocale = hashParams.l ?? localStorage.getItem(LS.locale) ?? defaultLocale;
let locale: Locale = locales[isLocaleId(wantedLocale) ? wantedLocale : defaultLocale];
let badMap = false;
function initialRoom(): World {
  const code = hashParams.m ?? localStorage.getItem(LS.room);
  if (code) {
    try {
      return decodeWorld(code);
    } catch {
      badMap = hashParams.m !== undefined;
    }
  }
  return decodeWorld(DEFAULT_ROOM);
}
let room: World = initialRoom(); // the reset state, what links share
let world: World = cloneWorld(room); // what is drawn; runs continue from here
const savedView = Number(localStorage.getItem(LS.view) ?? 0);
let view: View = (savedView >= 0 && savedView <= 3 ? savedView : 0) as View;
let steps = 0;
let statusKey: 'ready' | 'running' | 'stopped' | 'done' = 'ready';
let statusLine: number | null = null;
let errorText: string | null = null;
// room editing: on while the Room tab is open; clicks on the floor edit what is drawn and make it the room
type Tool = 'brickAdd' | 'brickRemove' | 'mark' | 'hole' | 'karel';
let editing = false;
let tool: Tool = 'brickAdd';
let hover: [number, number] | null = null;

const canvas = $<HTMLCanvasElement>('cv');
const hud = $('hud');
const status = $('status');
const savedEl = $('saved');
const toast = $('toast');
const speedInput = $<HTMLInputElement>('speed');

const driver = new Driver({
  onTick(tick) {
    world = tick.world;
    steps = tick.steps;
    statusLine = tick.pos.line;
    editor.setRunLine(tick.pos.line);
    draw();
  },
  onEnd(result) {
    world = result.world;
    steps = result.steps;
    if (result.ok) {
      statusKey = 'done';
      statusLine = null;
      editor.setRunLine(null);
    } else {
      statusKey = 'stopped';
      statusLine = result.pos.line;
      errorText = locale.runtime[result.code] ?? result.code;
      editor.setRunLine(null);
      editor.setErrorLine(result.pos.line);
    }
    draw();
  },
  onState(state) {
    editor.setReadOnly(state === 'running');
    $<HTMLButtonElement>('stop').disabled = state === 'idle' || state === 'finished';
    $<HTMLButtonElement>('run').classList.toggle('down', state === 'running');
  },
});

// A room link starts with an empty program: a fresh assignment, not last time's code. `#p=` fills it in once decoded.
const editor = new Editor($('ed'), hashParams.p || hashParams.m ? '' : (localStorage.getItem(LS.program) ?? DEFAULT_PROGRAM[locale.id]), locale, () => {
  if (driver.state === 'paused') {
    // the armed program is stale now; the next run takes the new text from the current world
    driver.stop();
    statusKey = 'ready';
    statusLine = null;
  }
  errorText = null;
  editor.setErrorLine(null);
  editor.setRunLine(null);
  scheduleSave();
  draw();
});

// ---- drawing and text

function t(key: string): string {
  return locale.ui[key] ?? key;
}

function draw(): void {
  renderWorld(canvas, world, view, undefined, editing ? { ghost: true, hover } : {});
  canvas.classList.toggle('edit', editing);
  const dirs = t('dirs').split(',');
  const views = t('views').split(',');
  hud.innerHTML = `${t('karel')} ${world.karel.x + 1}, ${room.h - world.karel.y} → ${dirs[world.karel.dir]}<small>${t('steps')} ${steps}, ${t('view')} ${views[view]}</small>`;
  let s = t(statusKey);
  if (statusLine !== null) s += `, ${t('line')} ${statusLine}`;
  status.textContent = s;
  status.classList.toggle('err', errorText !== null);
  if (errorText) status.textContent = errorText;
  $('roomname').textContent = `${room.w} × ${room.h}`;
}

function applyLocaleText(): void {
  document.documentElement.lang = locale.id;
  $('share').textContent = t('share');
  $('run').querySelector('span')!.textContent = t('run');
  $('step').querySelector('span')!.textContent = t('stepOnce');
  $('stop').querySelector('span')!.textContent = t('stop');
  $('speedSlot').querySelector('span')!.textContent = t('speed');
  $('reset').querySelector('span')!.textContent = t('reset');
  $('reset').querySelector('small')!.textContent = t('resetHint');
  $('rotL').title = t('rotateLeft');
  $('rotR').title = t('rotateRight');
  for (const b of $('tabs').querySelectorAll<HTMLButtonElement>('button')) b.textContent = t(b.dataset['tab'] ?? '');
  $('lblW').textContent = t('width');
  $('lblH').textContent = t('height');
  $('lblCode').textContent = t('mapCode');
  $('newRoom').textContent = t('newRoom');
  $('editHint').textContent = t('editHint');
  for (const b of $('tools').querySelectorAll<HTMLButtonElement>('button')) b.textContent = t(`tool${b.dataset['tool']![0]!.toUpperCase()}${b.dataset['tool']!.slice(1)}`);
  $('applyMap').textContent = t('applyMap');
  $('captureRoom').textContent = t('captureRoom');
  $('download').textContent = t('download');
  $('upload').textContent = t('upload');
  const lang = $('lang');
  lang.innerHTML = '';
  for (const id of localeIds) {
    const b = document.createElement('button');
    b.textContent = id.toUpperCase();
    b.classList.toggle('on', id === locale.id);
    b.addEventListener('click', () => switchLocale(id));
    lang.appendChild(b);
  }
  const k = locale.keywords;
  const rows: [string, string][] = [
    [`${k.proc} … ${k.end}`, t('refProc')],
    [`${k.cond} … ${k.end}`, t('refCond')],
    [k.step, t('refStep')],
    [k.left, t('refLeft')],
    [k.right, t('refRight')],
    [k.place, t('refPlace')],
    [k.pick, t('refPick')],
    [k.mark, t('refMark')],
    [k.unmark, t('refUnmark')],
    [`${k.repeat} N ${k.times} … ${k.end}`, t('refRepeat')],
    [`${k.while} ${k.is} / ${k.isNot} … ${k.end}`, t('refWhile')],
    [`${k.if} … ${k.then} … ${k.else} … ${k.end}`, t('refIf')],
    [`${k.wall}, ${k.brick}, ${k.marked}, ${k.vacant}`, t('refPreds')],
  ];
  $('ref').innerHTML =
    `<div class="intro">${t('refIntro')}</div>` + rows.map(([a, b]) => `<span class="k">${a}</span><span>${b}</span>`).join('');
  draw();
}

function showToast(text: string): void {
  toast.textContent = text;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 1800);
}

// ---- actions

function resetWorld(): void {
  driver.stop();
  world = cloneWorld(room);
  steps = 0;
  statusKey = 'ready';
  statusLine = null;
  errorText = null;
  editor.setRunLine(null);
  editor.setErrorLine(null);
  draw();
}

function arm(): boolean {
  let program;
  try {
    program = parse(editor.text, locale);
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    errorText = `${t('line')} ${e.pos.line}: ${e.message}`;
    editor.setErrorLine(e.pos.line);
    statusKey = 'stopped';
    draw();
    return false;
  }
  steps = 0;
  errorText = null;
  editor.setErrorLine(null);
  driver.load(program, world); // from where Karel is now, not from the room
  return true;
}

function onRun(): void {
  if (driver.state === 'running') {
    driver.pause();
    statusKey = 'stopped';
    draw();
    return;
  }
  if (driver.state === 'idle' || driver.state === 'finished') {
    if (!arm()) return;
  }
  statusKey = 'running';
  driver.start();
  draw();
}

function onStep(): void {
  if (driver.state === 'idle' || driver.state === 'finished') {
    if (!arm()) return;
  }
  statusKey = 'stopped';
  driver.step();
  draw();
}

function onStop(): void {
  driver.stop();
  statusKey = 'stopped';
  editor.setRunLine(null);
  draw();
}

function rotate(delta: number): void {
  view = (((view + delta) % 4) + 4) % 4 as View;
  localStorage.setItem(LS.view, String(view));
  draw();
}

function switchLocale(id: LocaleId): void {
  if (id === locale.id) return;
  const from = locale;
  locale = locales[id];
  localStorage.setItem(LS.locale, id);
  editor.setText(translate(editor.text, from, locale));
  editor.setLocale(locale);
  applyLocaleText();
  resetWorld();
}

function setRoom(next: World): void {
  room = next;
  localStorage.setItem(LS.room, encodeWorld(room));
  $<HTMLInputElement>('roomW').value = String(room.w);
  $<HTMLInputElement>('roomH').value = String(room.h);
  $<HTMLTextAreaElement>('roomCode').value = encodeWorld(room);
  resetWorld();
}

/** One edit click on a floor tile: mutate the drawn world, then it becomes the room. Invalid edits do nothing. */
function editTile(x: number, y: number): void {
  const w = cloneWorld(world);
  const tile = tileAt(w, x, y)!;
  const onKarel = w.karel.x === x && w.karel.y === y;
  switch (tool) {
    case 'brickAdd':
      if (tile.removed || tile.bricks >= MAX_BRICKS) return;
      tile.bricks++;
      break;
    case 'brickRemove':
      if (tile.removed || tile.bricks === 0) return;
      tile.bricks--;
      break;
    case 'mark':
      if (tile.removed) return;
      tile.mark = !tile.mark;
      break;
    case 'hole':
      if (onKarel) return;
      tile.removed = !tile.removed;
      if (tile.removed) {
        tile.bricks = 0;
        tile.mark = false;
      }
      break;
    case 'karel':
      if (tile.removed) return;
      if (onKarel) turnRight(w);
      else w.karel = { ...w.karel, x, y };
      break;
  }
  setRoom(w);
}

function canvasPoint(e: MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

async function share(): Promise<void> {
  // built by hand: the map code is URL-safe as is, and commas stay readable
  let hash = `m=${encodeWorld(room)}`;
  const text = editor.text.trim();
  if (text) hash += `&p=${await encodeProgram(text)}`;
  hash += `&l=${locale.id}`;
  const url = `${location.origin}${location.pathname}#${hash}`;
  history.replaceState(null, '', `#${hash}`);
  try {
    await navigator.clipboard.writeText(url);
    showToast(t('copied'));
  } catch {
    prompt('URL', url);
  }
}

/** Identifiers that are keywords in another locale would break translation. */
function checkIdentifiers(): void {
  const clash = new Set<string>();
  const own = new Set(Object.values(locale.keywords).flatMap((w) => w.split(' ')));
  const all = allKeywordWords();
  for (const line of editor.text.split('\n')) {
    const head = line.trim().split(/\s+/);
    if (head.length < 2) continue;
    const kw = normalize(head[0]!);
    if (kw !== locale.keywords.proc && kw !== locale.keywords.cond) continue;
    const name = normalize(head[1]!);
    if (all.has(name) && !own.has(name)) clash.add(name);
  }
  if (clash.size) showToast(t('identifierClash').replace('{name}', [...clash][0]!));
}

let saveTimer: number | null = null;
function scheduleSave(): void {
  savedEl.textContent = '';
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    localStorage.setItem(LS.program, editor.text);
    savedEl.textContent = t('saved');
    checkIdentifiers();
  }, 600);
}

function download(): void {
  const text = editor.text;
  const header = `# karel lang=${locale.id}\n`;
  const body = /^# karel lang=/.test(text) ? text : header + text;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
  a.download = 'program.karel';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function upload(file: File): Promise<void> {
  const text = await file.text();
  const m = /^# karel lang=(\w+)\n?/.exec(text);
  if (m && isLocaleId(m[1]!) && m[1] !== locale.id) switchLocale(m[1]);
  editor.setText(m ? text.slice(m[0].length) : text);
  resetWorld();
}

// ---- wiring

$('run').addEventListener('click', onRun);
$('step').addEventListener('click', onStep);
$('stop').addEventListener('click', onStop);
$('reset').addEventListener('click', resetWorld);
$('rotL').addEventListener('click', () => rotate(1));
$('rotR').addEventListener('click', () => rotate(-1));
$('share').addEventListener('click', () => void share());
speedInput.addEventListener('input', () => {
  driver.setSpeed(Number(speedInput.value));
  localStorage.setItem(LS.speed, speedInput.value);
});
$('tabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
  if (!b) return;
  for (const x of $('tabs').querySelectorAll('button')) x.classList.toggle('on', x === b);
  for (const x of document.querySelectorAll<HTMLElement>('.tab')) x.classList.toggle('on', x.id === `tab-${b.dataset['tab']}`);
  editing = b.dataset['tab'] === 'room';
  if (!editing) hover = null;
  if (b.dataset['tab'] === 'program') editor.focus();
  draw();
});
$('tools').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tool]');
  if (!b) return;
  tool = b.dataset['tool'] as Tool;
  for (const x of $('tools').querySelectorAll('button')) x.classList.toggle('on', x === b);
});
canvas.addEventListener('mousemove', (e) => {
  if (!editing) return;
  const [px, py] = canvasPoint(e);
  const next = pickTile(canvas, world, view, px, py);
  if (next?.[0] === hover?.[0] && next?.[1] === hover?.[1]) return;
  hover = next;
  draw();
});
canvas.addEventListener('mouseleave', () => {
  if (!hover) return;
  hover = null;
  draw();
});
canvas.addEventListener('click', (e) => {
  if (!editing) return;
  const [px, py] = canvasPoint(e);
  const hit = pickTile(canvas, world, view, px, py);
  if (hit) editTile(hit[0], hit[1]);
});
// width and height inputs resize the room in place, content and school coordinates kept
for (const id of ['roomW', 'roomH'] as const)
  $<HTMLInputElement>(id).addEventListener('change', () => {
    const w = Math.max(1, Math.min(MAX_SIZE, Number($<HTMLInputElement>('roomW').value) || 1));
    const h = Math.max(1, Math.min(MAX_SIZE, Number($<HTMLInputElement>('roomH').value) || 1));
    if (w === room.w && h === room.h) return;
    setRoom(resizeWorld(world, w, h));
  });
$('newRoom').addEventListener('click', () => {
  const w = Math.max(1, Math.min(MAX_SIZE, Number($<HTMLInputElement>('roomW').value) || 1));
  const h = Math.max(1, Math.min(MAX_SIZE, Number($<HTMLInputElement>('roomH').value) || 1));
  setRoom(emptyWorld(w, h));
});
$('applyMap').addEventListener('click', () => {
  try {
    setRoom(decodeWorld($<HTMLTextAreaElement>('roomCode').value));
  } catch {
    showToast(t('badMap'));
  }
});
$('captureRoom').addEventListener('click', () => setRoom(cloneWorld(world)));
$('download').addEventListener('click', download);
$('upload').addEventListener('click', () => $('uploadFile').click());
$<HTMLInputElement>('uploadFile').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void upload(f);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'F5') {
    e.preventDefault();
    onRun();
  } else if (e.key === 'F10') {
    e.preventDefault();
    onStep();
  } else if (e.key === 'Escape') {
    if (driver.state === 'running' || driver.state === 'paused') onStop();
  }
});
new ResizeObserver(() => draw()).observe(canvas);

// ---- boot

speedInput.value = (() => {
  const v = Number(localStorage.getItem(LS.speed) ?? 3);
  return String(v >= 1 && v <= 5 ? v : 3);
})();
driver.setSpeed(Number(speedInput.value));
applyLocaleText();
setRoom(room);
if (badMap) showToast(t('badMap'));
editor.focus();

if (hashParams.p) {
  decodeProgram(hashParams.p)
    .then((text) => editor.setText(text))
    .catch(() => editor.setText(localStorage.getItem(LS.program) ?? DEFAULT_PROGRAM[locale.id]));
}

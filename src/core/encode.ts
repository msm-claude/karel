// Room link encoding, v1. Public interface: versioned, v1 stays decodable forever.
//
//   1.<w>x<h>.<kx>,<ky>,<dir>.<tiles>
//
// Tiles row-major, one Latin letter each: `z` = removed, else index = bricks*2+mark
// mapped onto A..Z a..y (0..50). A repeated symbol gets a decimal count prefix.
import { emptyWorld, MAX_SIZE, type Dir, type Tile, type World } from './world';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxy';
const REMOVED = 'z';

function tileChar(t: Tile): string {
  if (t.removed) return REMOVED;
  const idx = t.bricks * 2 + (t.mark ? 1 : 0);
  const c = ALPHABET[idx];
  if (!c) throw new Error(`tile not encodable: ${t.bricks} bricks`);
  return c;
}

function charTile(c: string): Tile | undefined {
  if (c === REMOVED) return { removed: true, bricks: 0, mark: false };
  const idx = ALPHABET.indexOf(c);
  if (idx < 0) return undefined;
  return { removed: false, bricks: idx >> 1, mark: (idx & 1) === 1 };
}

export function encodeWorld(world: World): string {
  const { w, h, karel } = world;
  let tiles = '';
  let prev = '';
  let count = 0;
  const flush = () => {
    if (!count) return;
    tiles += count > 1 ? `${count}${prev}` : prev;
  };
  for (const t of world.tiles) {
    const c = tileChar(t);
    if (c === prev) count++;
    else {
      flush();
      prev = c;
      count = 1;
    }
  }
  flush();
  return `1.${w}x${h}.${karel.x},${karel.y},${karel.dir}.${tiles}`;
}

export class DecodeError extends Error {}

export function decodeWorld(code: string): World {
  const m = /^1\.(\d+)x(\d+)\.(\d+),(\d+),([0-3])\.([A-Za-z0-9]*)$/.exec(code.trim());
  if (!m) throw new DecodeError('bad header');
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w < 1 || h < 1 || w > MAX_SIZE || h > MAX_SIZE) throw new DecodeError('bad size');
  const kx = Number(m[3]);
  const ky = Number(m[4]);
  const dir = Number(m[5]) as Dir;
  if (kx >= w || ky >= h) throw new DecodeError('karel outside');
  const tiles: Tile[] = [];
  const body = m[6] ?? '';
  const re = /(\d*)([A-Za-z])/g;
  let consumed = 0;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(body))) {
    consumed += mm[0].length;
    const n = mm[1] ? Number(mm[1]) : 1;
    const t = charTile(mm[2]!);
    if (!t) throw new DecodeError('bad tile');
    for (let i = 0; i < n; i++) tiles.push({ ...t });
  }
  if (consumed !== body.length) throw new DecodeError('bad body');
  if (tiles.length !== w * h) throw new DecodeError('bad length');
  const k = tiles[ky * w + kx]!;
  if (k.removed) throw new DecodeError('karel on removed tile');
  const world = emptyWorld(w, h);
  world.tiles = tiles;
  world.karel = { x: kx, y: ky, dir };
  return world;
}

// Program param: deflate + base64url. Only added to a link when a program travels with it.

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(src).arrayBuffer());
}

export async function encodeProgram(text: string): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')));
}

export async function decodeProgram(param: string): Promise<string> {
  return new TextDecoder().decode(await pipe(fromBase64Url(param), new DecompressionStream('deflate-raw')));
}

/** Parse the URL hash `#m=...&p=...&l=sk` into its parts. */
export function parseHash(hash: string): { m?: string; p?: string; l?: string } {
  const out: { m?: string; p?: string; l?: string } = {};
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const m = params.get('m');
  const p = params.get('p');
  const l = params.get('l');
  if (m) out.m = m;
  if (p) out.p = p;
  if (l) out.l = l;
  return out;
}

// Canvas 2D isometric renderer. Pure: (ctx, world, view) -> pixels. Cubes are
// three-face paths, painter's order far -> near, Karel drawn after his tile's
// stack. No image assets; the "texture" is a deterministic shade hash per face.
import type { World } from '../core/world';

export type View = 0 | 1 | 2 | 3;

export interface Palette {
  floorTop: string;
  floorLeft: string;
  floorRight: string;
  brickTop: string;
  brickLeft: string;
  brickRight: string;
  mark: string;
  markInner: string;
  pit: string;
  plate: string;
  edge: string;
  hover: string;
  karelTop: string;
  karelLeft: string;
  karelRight: string;
  karelDark: string;
  karelAccent: string;
  karelEye: string;
  visor: string;
}

export const OVERWORLD: Palette = {
  floorTop: '#5cb531',
  floorLeft: '#6e4526',
  floorRight: '#8a5a33',
  brickTop: '#a6a6a6',
  brickLeft: '#6a6a6a',
  brickRight: '#868686',
  mark: '#ffd23f',
  markInner: '#fff0a8',
  pit: '#2a1c10',
  plate: 'rgba(23,33,43,.18)',
  edge: 'rgba(23,33,43,.6)',
  hover: '#ffffff',
  karelTop: '#a3adb5',
  karelLeft: '#5e6970',
  karelRight: '#7f8b94',
  karelDark: '#2b2b2b',
  karelAccent: '#e8562a',
  karelEye: '#ff3b1f',
  visor: '#17212b',
};

type Pt = [number, number];

function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h ^= (v * 977) | 0;
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + f))));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Rotate world coordinates into view space. Returns rotated size and the mapping. */
export function rotated(world: World, view: View): { rw: number; rh: number; map: (x: number, y: number) => Pt } {
  const { w, h } = world;
  const rw = view % 2 ? h : w;
  const rh = view % 2 ? w : h;
  const map = (x: number, y: number): Pt => {
    switch (view) {
      case 0:
        return [x, y];
      case 1:
        return [y, w - 1 - x];
      case 2:
        return [w - 1 - x, h - 1 - y];
      case 3:
        return [h - 1 - y, x];
    }
  };
  return { rw, rh, map };
}

export interface RenderOptions {
  /** number the tiles like a chessboard: columns 1..w along the south edge, rows 1..h (from the bottom) along the east edge */
  labels?: boolean;
  labelColor?: string;
  /** how many brick levels the fit reserves room for; the app keeps 10 (the cap), a static picture can pass what it holds */
  levels?: number;
  /** room editing: bricks, marks and Karel go translucent so the floor underneath stays clickable */
  ghost?: boolean;
  /** world tile to highlight on the floor (the one under the pointer) */
  hover?: [number, number] | null;
  /** draw a small arrow outside the north edge of the room, pointing north, with this letter at the tip */
  compass?: string;
}

export interface Layout {
  W: number;
  H: number;
  FZ: number;
  ox: number;
  oy: number;
  rw: number;
  rh: number;
  map: (x: number, y: number) => Pt;
  /** rotated cell index -> world tile index */
  inv: Int32Array;
}

/** Tile size and origin for a world in a css-pixel box; shared by the renderer and the hit test. */
export function layout(cssW: number, cssH: number, world: World, view: View, opts: RenderOptions = {}): Layout {
  const { rw, rh, map } = rotated(world, view);
  const inv = new Int32Array(rw * rh);
  for (let y = 0; y < world.h; y++)
    for (let x = 0; x < world.w; x++) {
      const [i, j] = map(x, y);
      inv[j * rw + i] = y * world.w + x;
    }
  const maxLevels = opts.levels ?? 10; // bricks per tile cap
  const pad = opts.labels ? 0.84 : 0.92; // room for the numbers
  const W = Math.min((cssW / (rw + rh)) * pad, (cssH / ((rw + rh) / 2 + maxLevels * 0.35 + 0.8)) * pad, 52);
  const H = W / 2;
  const Z = W * 0.62;
  const ox = cssW / 2 + ((rh - rw) * W) / 2;
  const oy = (cssH - (rw + rh) * H) / 2 + maxLevels * 0.12 * Z;
  return { W, H, FZ: W * 0.28, ox, oy, rw, rh, map, inv };
}

/** World tile whose floor top lies under the css-pixel point (px, py) of the canvas, or null. */
export function pickTile(canvas: HTMLCanvasElement, world: World, view: View, px: number, py: number, opts: RenderOptions = {}): [number, number] | null {
  const L = layout(canvas.clientWidth, canvas.clientHeight, world, view, opts);
  const u = (px - L.ox) / L.W; // i - j
  const v = (py + L.FZ - L.oy) / L.H; // i + j, the floor top sits FZ above the ground plane
  const i = Math.round((u + v) / 2);
  const j = Math.round((v - u) / 2);
  if (i < 0 || j < 0 || i >= L.rw || j >= L.rh) return null;
  const idx = L.inv[j * L.rw + i]!;
  return [idx % world.w, Math.floor(idx / world.w)];
}

export function renderWorld(canvas: HTMLCanvasElement, world: World, view: View, P: Palette = OVERWORLD, opts: RenderOptions = {}): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW === 0 || cssH === 0) return;
  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const { W, H, FZ, ox, oy, rw, rh, map, inv } = layout(cssW, cssH, world, view, opts);
  const Z = W * 0.62; // Karel's unit height
  const BZ = W * 0.31; // one brick: half a unit, so tall stacks stay readable
  const sx = (i: number, j: number) => ox + (i - j) * W;
  const sy = (i: number, j: number) => oy + (i + j) * H;

  function poly(pts: Pt[], fill: string, stroke?: string): void {
    ctx!.beginPath();
    ctx!.moveTo(pts[0]![0], pts[0]![1]);
    for (let k = 1; k < pts.length; k++) ctx!.lineTo(pts[k]![0], pts[k]![1]);
    ctx!.closePath();
    if (fill !== 'transparent') {
      ctx!.fillStyle = fill;
      ctx!.fill();
    }
    if (stroke) {
      ctx!.strokeStyle = stroke;
      ctx!.lineWidth = 1;
      ctx!.stroke();
    }
  }

  function face(o: Pt, du: Pt, dv: Pt, color: string, seed: number, faceId: number, edged: boolean): void {
    const c = (u: number, v: number): Pt => [o[0] + u * du[0] + v * dv[0], o[1] + u * du[1] + v * dv[1]];
    poly([c(0, 0), c(1, 0), c(1, 1), c(0, 1)], color);
    const n = 4;
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) {
        const r = hash(seed, faceId, a, b);
        if (r < 0.55) continue;
        const f = r < 0.75 ? -0.06 : r < 0.9 ? 0.05 : -0.11;
        poly([c(a / n, b / n), c((a + 1) / n, b / n), c((a + 1) / n, (b + 1) / n), c(a / n, (b + 1) / n)], shade(color, f));
      }
    if (edged) poly([c(0, 0), c(1, 0), c(1, 1), c(0, 1)], 'transparent', P.edge);
  }

  function box(i: number, j: number, hw: number, z0: number, z1: number, cols: [string, string, string], seed: number, edged = true): void {
    const cx = sx(i, j);
    const cy = sy(i, j);
    const hh = hw / 2;
    const L: Pt = [cx - hw, cy];
    const T: Pt = [cx, cy - hh];
    const R: Pt = [cx + hw, cy];
    const B: Pt = [cx, cy + hh];
    const up = (p: Pt, z: number): Pt => [p[0], p[1] - z];
    face(up(L, z1), [B[0] - L[0], B[1] - L[1]], [0, z1 - z0], cols[1], seed, 1, edged);
    face(up(B, z1), [R[0] - B[0], R[1] - B[1]], [0, z1 - z0], cols[2], seed, 2, edged);
    face(up(L, z1), [T[0] - L[0], T[1] - L[1]], [B[0] - L[0], B[1] - L[1]], cols[0], seed, 0, edged);
  }

  function hoverAt(i: number, j: number, z: number): void {
    const cx = sx(i, j);
    const cy = sy(i, j) - z;
    poly([[cx - W, cy], [cx, cy - H], [cx + W, cy], [cx, cy + H]], 'rgba(255,255,255,0.45)', P.hover);
    ctx!.lineWidth = 1;
  }

  function markAt(i: number, j: number, z: number): void {
    const cx = sx(i, j);
    const cy = sy(i, j) - z - 0.5;
    const hw = W * 0.84; // nearly the whole tile, so it stays visible around Karel
    poly([[cx - hw, cy], [cx, cy - hw / 2], [cx + hw, cy], [cx, cy + hw / 2]], P.mark, P.edge);
    const w2 = W * 0.5;
    poly([[cx - w2, cy], [cx, cy - w2 / 2], [cx + w2, cy], [cx, cy + w2 / 2]], P.markInner);
  }

  /** band on a visible box face: side 1 = front-left, 2 = front-right; u along the face, z in px */
  function band(cx: number, cy: number, hw: number, side: 1 | 2, u0: number, u1: number, z0: number, z1: number, color: string): void {
    const a: Pt = side === 1 ? [cx - hw, cy] : [cx, cy + hw / 2];
    const b: Pt = side === 1 ? [cx, cy + hw / 2] : [cx + hw, cy];
    const p = (t: number, zz: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - zz];
    poly([p(u0, z0), p(u1, z0), p(u1, z1), p(u0, z1)], color);
  }

  function karelAt(i: number, j: number, z: number, rel: number, onMark: boolean): void {
    const steel: [string, string, string] = [P.karelTop, P.karelLeft, P.karelRight];
    const cx = sx(i, j);
    const cy = sy(i, j);
    const base = onMark ? P.mark : P.karelDark;
    box(i, j, W * 0.44, z, z + Z * 0.14, [base, base, base], 9001, true);
    const bz0 = z + Z * 0.14;
    const bz1 = bz0 + Z * 0.98;
    const bw = W * 0.46;
    const dv: Pt = rel === 0 ? [1, 0] : rel === 1 ? [0, -1] : rel === 2 ? [-1, 0] : [0, 1];
    box(i, j, bw, bz0, bz1, steel, 9002, true);
    // visible faces: 1 looks south (0,1), 2 looks east (1,0); chest plate on the front, vents on the back
    for (const side of [1, 2] as const) {
      const n: Pt = side === 1 ? [0, 1] : [1, 0];
      const dot = n[0] * dv[0] + n[1] * dv[1];
      band(cx, cy, bw, side, 0, 1, bz0 + Z * 0.3, bz0 + Z * 0.3 + 1.2, '#3b444a'); // waist seam
      if (dot > 0) {
        band(cx, cy, bw, side, 0.15, 0.85, bz0 + Z * 0.4, bz0 + Z * 0.66, P.karelAccent);
        band(cx, cy, bw, side, 0.15, 0.85, bz0 + Z * 0.4, bz0 + Z * 0.4 + 1.2, '#8a2f10');
      } else if (dot < 0) {
        band(cx, cy, bw, side, 0.15, 0.85, bz0 + Z * 0.38, bz0 + Z * 0.7, '#3b444a');
        for (let k = 0; k < 3; k++) band(cx, cy, bw, side, 0.22, 0.78, bz0 + Z * (0.43 + k * 0.09), bz0 + Z * (0.46 + k * 0.09), '#1e2427');
      }
    }
    const hw = W * 0.36;
    const hz0 = bz1 + Z * 0.06;
    const hh = Z * 0.5;
    box(i, j, hw, hz0, hz0 + hh, steel, 9003, true);
    for (const side of [1, 2] as const) band(cx, cy, hw, side, 0, 1, hz0 + hh * 0.3, hz0 + hh * 0.62, P.visor);
    const f = rel === 0 ? 2 : rel === 3 ? 1 : 0;
    if (f) {
      band(cx, cy, hw, f, 0.16, 0.42, hz0 + hh * 0.36, hz0 + hh * 0.56, P.karelEye);
      band(cx, cy, hw, f, 0.58, 0.84, hz0 + hh * 0.36, hz0 + hh * 0.56, P.karelEye);
    }
  }

  // ground plate
  {
    const pad = W * 0.35;
    const L = [sx(0, rh - 1), sy(0, rh - 1)];
    const T = [sx(0, 0), sy(0, 0)];
    const R = [sx(rw - 1, 0), sy(rw - 1, 0)];
    const B = [sx(rw - 1, rh - 1), sy(rw - 1, rh - 1)];
    poly(
      [
        [L[0]! - W - pad, L[1]! + 3],
        [T[0]!, T[1]! - H - pad / 2 + 3],
        [R[0]! + W + pad, R[1]! + 3],
        [B[0]!, B[1]! + H + pad / 2 + 3],
      ],
      P.plate,
    );
  }

  const [ki, kj] = map(world.karel.x, world.karel.y);
  const rel = (((world.karel.dir - view) % 4) + 4) % 4;

  // painter's order: by i+j ascending, then j
  for (let s = 0; s <= rw + rh - 2; s++) {
    for (let j = Math.max(0, s - rw + 1); j <= Math.min(rh - 1, s); j++) {
      const i = s - j;
      const idx = inv[j * rw + i]!;
      const t = world.tiles[idx]!;
      const wx = idx % world.w;
      const wy = (idx - wx) / world.w;
      const hovered = opts.hover?.[0] === wx && opts.hover?.[1] === wy;
      if (t.removed) {
        const cx = sx(i, j);
        const cy = sy(i, j);
        poly([[cx - W, cy], [cx, cy - H], [cx + W, cy], [cx, cy + H]], P.pit);
        if (hovered) hoverAt(i, j, 0);
        continue;
      }
      box(i, j, W, 0, FZ, [P.floorTop, P.floorLeft, P.floorRight], wx * 31 + wy);
      if (hovered) hoverAt(i, j, FZ);
      let z = FZ;
      if (opts.ghost) ctx.globalAlpha = 0.45;
      for (let k = 0; k < t.bricks; k++) {
        box(i, j, W, z, z + BZ, [P.brickTop, P.brickLeft, P.brickRight], wx * 31 + wy + k * 7);
        z += BZ;
      }
      if (t.mark) markAt(i, j, z);
      if (i === ki && j === kj) karelAt(i, j, z, rel, t.mark);
      ctx.globalAlpha = 1;
    }
  }

  // a point just outside the room: tile (x, y) pushed `d` tiles along the world direction (dx, dy), on screen;
  // in front of the room it also clears the floor's side face
  const outside = (x: number, y: number, dx: number, dy: number, d: number): [number, number] => {
    const [i0, j0] = map(0, 0);
    const [i1, j1] = map(dx, dy);
    const ni = i1 - i0;
    const nj = j1 - j0;
    const [ti, tj] = map(x, y);
    const i = ti + ni * d;
    const j = tj + nj * d;
    // on the plane of the tile tops (the floor is FZ thick); in front, drop below the side face as well
    return [sx(i, j), sy(i, j) - FZ + (ni + nj > 0 ? FZ * 1.7 : 0)];
  };

  if (opts.labels) {
    // like a chessboard: columns 1..w along the south edge, rows 1..h (from the bottom) along the east edge;
    // the numbers stay on their edges when the room turns
    ctx.fillStyle = opts.labelColor ?? P.karelDark;
    ctx.font = `600 ${Math.max(9, Math.round(W * 0.34))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let x = 0; x < world.w; x++) {
      const [px, py] = outside(x, world.h - 1, 0, 1, 0.7);
      ctx.fillText(String(x + 1), px, py);
    }
    for (let y = 0; y < world.h; y++) {
      const [px, py] = outside(world.w - 1, y, 1, 0, 0.7);
      ctx.fillText(String(world.h - y), px, py);
    }
  }

  if (opts.compass) {
    // a small arrow lying on the floor a little way outside the middle of the north edge, pointing north,
    // the word for north beyond its tip; it turns with the room
    const [i0, j0] = map(0, 0);
    const [i1, j1] = map(0, -1);
    const dx = (i1 - i0) - (j1 - j0);
    const dy = ((i1 - i0) + (j1 - j0)) / 2;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const L = Math.max(12, W * 0.55);
    const [cx, cy] = outside((world.w - 1) / 2, 0, 0, -1, 1.4);
    const tipX = cx + ux * L;
    const tipY = cy + uy * L;
    const color = opts.labelColor ?? P.karelDark;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX + ux * 6, tipY + uy * 6);
    ctx.lineTo(tipX - uy * 4, tipY + ux * 4);
    ctx.lineTo(tipX + uy * 4, tipY - ux * 4);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const half = ctx.measureText(opts.compass).width / 2;
    const push = 8 + half * Math.abs(ux) + 7 * Math.abs(uy); // the word's centre sits clear of the tip in any direction
    ctx.fillText(opts.compass, tipX + ux * push, tipY + uy * push);
  }
}

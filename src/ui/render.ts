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
  karelTop: string;
  karelLeft: string;
  karelRight: string;
  karelDark: string;
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
  karelTop: '#ff7a4a',
  karelLeft: '#b53c17',
  karelRight: '#e8562a',
  karelDark: '#2b2b2b',
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
  /** number the tiles: columns 1..w along the front-left edge, rows 1..h (from the bottom) along the front-right edge; view 0 only */
  labels?: boolean;
  labelColor?: string;
  /** how many brick levels the fit reserves room for; the app keeps 10 (the cap), a static picture can pass what it holds */
  levels?: number;
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

  const { rw, rh, map } = rotated(world, view);
  // inverse map: rotated cell -> world tile index
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
  const Z = W * 0.62; // Karel's unit height
  const BZ = W * 0.31; // one brick: half a unit, so tall stacks stay readable
  const FZ = W * 0.28;
  const ox = cssW / 2 + ((rh - rw) * W) / 2;
  const oy = (cssH - (rw + rh) * H) / 2 + maxLevels * 0.12 * Z;
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

  function markAt(i: number, j: number, z: number): void {
    const cx = sx(i, j);
    const cy = sy(i, j) - z - 0.5;
    const hw = W * 0.84; // nearly the whole tile, so it stays visible around Karel
    poly([[cx - hw, cy], [cx, cy - hw / 2], [cx + hw, cy], [cx, cy + hw / 2]], P.mark, P.edge);
    const w2 = W * 0.5;
    poly([[cx - w2, cy], [cx, cy - w2 / 2], [cx + w2, cy], [cx, cy + w2 / 2]], P.markInner);
  }

  function karelAt(i: number, j: number, z: number, rel: number, onMark: boolean): void {
    const bw = W * 0.5;
    const bh = Z * 1.05;
    const hw = W * 0.36;
    const hh = Z * 0.55;
    const body: [string, string, string] = [P.karelTop, P.karelLeft, P.karelRight];
    const base = onMark ? P.mark : P.karelDark;
    box(i, j, W * 0.42, z, z + Z * 0.16, [base, base, base], 9001, onMark);
    box(i, j, bw, z + Z * 0.16, z + Z * 0.16 + bh, body, 9002, false);
    const hz0 = z + Z * 0.16 + bh + Z * 0.08;
    box(i, j, hw, hz0, hz0 + hh, body, 9003, false);
    const cx = sx(i, j);
    const cy = sy(i, j);
    const vz = hz0 + hh * 0.35;
    const vh = hh * 0.3;
    const strip = (from: Pt, to: Pt) => {
      const p = (t: number, dz: number): Pt => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t - dz];
      poly([p(0.2, vz), p(0.8, vz), p(0.8, vz + vh), p(0.2, vz + vh)], P.visor);
    };
    if (rel === 0) strip([cx, cy + hw / 2], [cx + hw, cy]);
    else if (rel === 3) strip([cx - hw, cy], [cx, cy + hw / 2]);
    // direction arrow on the head top, always visible
    const c: Pt = [cx, cy - (hz0 + hh + 0.5)];
    const dirs: Pt[] = [
      [hw * 0.7, hw * 0.35],
      [hw * 0.7, -hw * 0.35],
      [-hw * 0.7, -hw * 0.35],
      [-hw * 0.7, hw * 0.35],
    ];
    const d = dirs[rel]!;
    const perp: Pt = [-d[1] * 0.5, d[0] * 0.5];
    poly(
      [
        [c[0] + d[0], c[1] + d[1]],
        [c[0] - d[0] * 0.3 + perp[0], c[1] - d[1] * 0.3 + perp[1]],
        [c[0] - d[0] * 0.3 - perp[0], c[1] - d[1] * 0.3 - perp[1]],
      ],
      P.visor,
    );
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
      if (t.removed) {
        const cx = sx(i, j);
        const cy = sy(i, j);
        poly([[cx - W, cy], [cx, cy - H], [cx + W, cy], [cx, cy + H]], P.pit);
        continue;
      }
      box(i, j, W, 0, FZ, [P.floorTop, P.floorLeft, P.floorRight], wx * 31 + wy);
      let z = FZ;
      for (let k = 0; k < t.bricks; k++) {
        box(i, j, W, z, z + BZ, [P.brickTop, P.brickLeft, P.brickRight], wx * 31 + wy + k * 7);
        z += BZ;
      }
      if (t.mark) markAt(i, j, z);
      if (i === ki && j === kj) karelAt(i, j, z, rel, t.mark);
    }
  }

  if (opts.labels && view === 0) {
    ctx.fillStyle = opts.labelColor ?? P.karelDark;
    ctx.font = `600 ${Math.max(9, Math.round(W * 0.34))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const off = W * 0.5;
    for (let i = 0; i < rw; i++) {
      // front-left edge: tile (i, rh-1), number below its left face
      ctx.fillText(String(i + 1), sx(i, rh - 1) - off, sy(i, rh - 1) + H * 0.55 + off * 0.5);
    }
    for (let j = 0; j < rh; j++) {
      // front-right edge: tile (rw-1, j); rows count from the bottom row
      ctx.fillText(String(rh - j), sx(rw - 1, j) + off, sy(rw - 1, j) + H * 0.55 + off * 0.5);
    }
  }
}

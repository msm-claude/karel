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

/** A drawn block: its footprint and height, plus the projection its faces were drawn with (for patches on them). */
interface Block {
  pt: (a: number, b: number, z: number) => Pt;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  z0: number;
  z1: number;
}

function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h ^= (v * 977) | 0;
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** Lighten (f > 0) or darken (f < 0) a #rrggbb colour; returns #rrggbb so the result can be shaded again. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + f)))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
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
  /** number the tiles like a chessboard: columns 1..w and rows 1..h (from the bottom), always on the two front edges */
  labels?: boolean;
  labelColor?: string;
  /** how many bricks the fit reserves headroom for (Karel on top is always added); the app keeps 10 (the cap), a static picture passes what it holds */
  levels?: number;
  /** room editing: bricks, marks and Karel go translucent so the floor underneath stays clickable */
  ghost?: boolean;
  /** world tile to highlight on the floor (the one under the pointer) */
  hover?: [number, number] | null;
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
  // vertical extent in tile widths: the floor diamonds span (rw + rh) / 2, plus the floor's thickness at the
  // front, plus at the back the floor's thickness, the tallest stack and Karel on top of it (1.1 + a little, see karelAt)
  const above = 0.28 + maxLevels * 0.31 + 1.14;
  const total = (rw + rh) / 2 + above + 0.28;
  const W = Math.min((cssW / (rw + rh)) * pad, (cssH / total) * pad, 52);
  const H = W / 2;
  const ox = cssW / 2 + ((rh - rw) * W) / 2;
  const oy = (cssH - total * W) / 2 + H + above * W; // the back corner's ground point, with the headroom above it
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

  // The texture is the expensive part of a frame (a face is one fill, its noise up to n*n more), and on a big map
  // a cell is a pixel or two: drop to a coarser grid as the tiles shrink, and to none at all once it cannot be seen.
  const NOISE = W >= 30 ? 4 : W >= 16 ? 2 : 0;
  const SHADES = [-0.06, 0.05, -0.11] as const;

  function face(o: Pt, du: Pt, dv: Pt, color: string, seed: number, faceId: number, edged: boolean): void {
    const c = (u: number, v: number): Pt => [o[0] + u * du[0] + v * dv[0], o[1] + u * du[1] + v * dv[1]];
    poly([c(0, 0), c(1, 0), c(1, 1), c(0, 1)], color);
    const n = NOISE;
    // one path per shade instead of one per cell: same picture, a third of the fills
    for (let g = 0; n > 0 && g < SHADES.length; g++) {
      let any = false;
      ctx!.beginPath();
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++) {
          const r = hash(seed, faceId, a, b);
          if (r < 0.55 || (r < 0.75 ? 0 : r < 0.9 ? 1 : 2) !== g) continue;
          const q = [c(a / n, b / n), c((a + 1) / n, b / n), c((a + 1) / n, (b + 1) / n), c(a / n, (b + 1) / n)];
          ctx!.moveTo(q[0]![0], q[0]![1]);
          for (let k = 1; k < 4; k++) ctx!.lineTo(q[k]![0], q[k]![1]);
          ctx!.closePath();
          any = true;
        }
      if (!any) continue;
      ctx!.fillStyle = shade(color, SHADES[g]!);
      ctx!.fill();
    }
    if (edged) poly([c(0, 0), c(1, 0), c(1, 1), c(0, 1)], 'transparent', P.edge);
  }

  /** A block over a in [a0, a1], b in [b0, b1] (tile units around the centre of tile (i, j); a tile is ±0.5), z0..z1 px. */
  function block(i: number, j: number, a0: number, a1: number, b0: number, b1: number, z0: number, z1: number, cols: [string, string, string], seed: number, edged: boolean): Block {
    const cx = sx(i, j);
    const cy = sy(i, j);
    const pt = (a: number, b: number, z: number): Pt => [cx + (a - b) * W, cy + (a + b) * H - z];
    const L = pt(a0, b1, z1);
    const B = pt(a1, b1, z1);
    const R = pt(a1, b0, z1);
    const T = pt(a0, b0, z1);
    const dz: Pt = [0, z1 - z0];
    face(L, [B[0] - L[0], B[1] - L[1]], dz, cols[1], seed, 1, edged);
    face(B, [R[0] - B[0], R[1] - B[1]], dz, cols[2], seed, 2, edged);
    face(L, [T[0] - L[0], T[1] - L[1]], [B[0] - L[0], B[1] - L[1]], cols[0], seed, 0, edged);
    return { pt, a0, a1, b0, b1, z0, z1 };
  }

  /** A block with a square footprint of half-width hw (screen px) centred on the tile. */
  function box(i: number, j: number, hw: number, z0: number, z1: number, cols: [string, string, string], seed: number, edged = true): void {
    const h = hw / (2 * W);
    block(i, j, -h, h, -h, h, z0, z1, cols, seed, edged);
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

  /**
   * A flat patch on a block's visible side face: side 1 faces south (+b), 2 faces east (+a). The face is a grid of
   * `cols` x `rows` cells; the patch covers cells [c, c + cw) from the left as drawn and [r, r + rh) from the top.
   */
  function pix(bx: Block, side: 1 | 2, c: number, r: number, color: string, cols: number, rows: number, cw = 1, rh = 1): void {
    const zt = bx.z1 - ((bx.z1 - bx.z0) * r) / rows;
    const zb = bx.z1 - ((bx.z1 - bx.z0) * (r + rh)) / rows;
    const u0 = c / cols;
    const u1 = (c + cw) / cols;
    const p = side === 1 ? (u: number, z: number) => bx.pt(bx.a0 + (bx.a1 - bx.a0) * u, bx.b1, z) : (u: number, z: number) => bx.pt(bx.a1, bx.b1 - (bx.b1 - bx.b0) * u, z);
    poly([p(u0, zt), p(u1, zt), p(u1, zb), p(u0, zb)], color);
  }

  /**
   * Karel: a blocky figure in 8:12:12 proportions (head, torso, legs), 32 units tall, standing on z. Steel body,
   * visor with two eyes on the head, chest plate on the front, hands and boots dark. rel is his facing in view space:
   * 0 east (+a), 1 north (-b), 2 west (-a), 3 south (+b). Side 1 (south) and 2 (east) are the visible faces.
   */
  function karelAt(i: number, j: number, z: number, rel: number): void {
    // Steve proportions stretched for a small tile: 32 units tall = 1.1 tile widths (the 1.14 headroom in layout), the
    // body 1.75x wider than Steve so he reads at map size, the head only 1.25x so it stays narrower than the shoulders
    const U = (W / 32) * 1.1;
    const UW = U * 1.75;
    const UH = U * 1.25;
    const steel: [string, string, string] = [P.karelTop, P.karelLeft, P.karelRight];
    const legs: [string, string, string] = [shade(P.karelTop, -0.18), shade(P.karelLeft, -0.18), shade(P.karelRight, -0.18)];
    const fwd: Pt = rel === 0 ? [1, 0] : rel === 1 ? [0, -1] : rel === 2 ? [-1, 0] : [0, 1];
    const alongA = fwd[0] !== 0;
    // a part centred `f` units forward and `s` units to the side, with half extents hf (forward) and hs (side), z0..z1 units
    const part = (f: number, s: number, hf: number, hs: number, z0: number, z1: number, cols: [string, string, string], seed: number, hu = UW): Block => {
      const ca = alongA ? f * fwd[0] : s;
      const cb = alongA ? s : f * fwd[1];
      const ha = alongA ? hf : hs;
      const hb = alongA ? hs : hf;
      const t = hu / W;
      return block(i, j, (ca - ha) * t, (ca + ha) * t, (cb - hb) * t, (cb + hb) * t, z + z0 * U, z + z1 * U, cols, seed, true);
    };
    const front: 0 | 1 | 2 = rel === 3 ? 1 : rel === 0 ? 2 : 0;
    const back: 0 | 1 | 2 = rel === 1 ? 1 : rel === 2 ? 2 : 0;
    // arms 2.8 units square (30% slimmer than Steve's 4), flush with the torso's side
    const arm = (s: number): void => {
      const a = part(0, s * 5.4, 1.4, 1.4, 12, 24, steel, 9007 + s);
      for (const side of [1, 2] as const) pix(a, side, 0, 3, P.karelDark, 1, 4); // hand
    };
    // painter's order: the far arm, legs, torso, head, then the near arm (+side points toward the viewer on both axes)
    arm(-1);
    for (const s of [-2, 2]) {
      const leg = part(0, s, 2, 2, 0, 12, legs, 9011 + s);
      for (const side of [1, 2] as const) pix(leg, side, 0, 11, P.karelDark, 1, 12); // boot
    }
    const torso = part(0, 0, 2, 4, 12, 24, steel, 9021);
    for (const side of [1, 2] as const) pix(torso, side, 0, 11, '#3b444a', 1, 12); // belt
    if (front) {
      pix(torso, front, 1, 3, P.karelAccent, 8, 12, 6, 5); // chest plate
      pix(torso, front, 1, 3, '#8a2f10', 8, 12, 6, 0.4);
    } else if (back) {
      for (let k = 0; k < 3; k++) pix(torso, back, 2, 3 + k * 2, '#1e2427', 8, 12, 4, 1); // vents
    }
    const head = part(0, 0, 4, 4, 24, 32, steel, 9031, UH);
    for (const side of [1, 2] as const) if (side !== back) pix(head, side, 0, 3, P.visor, 1, 8, 1, 2);
    if (front) {
      pix(head, front, 1, 3, P.karelEye, 8, 8, 2, 2);
      pix(head, front, 5, 3, P.karelEye, 8, 8, 2, 2);
    }
    arm(1);
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
      if (i === ki && j === kj) karelAt(i, j, z, rel);
      ctx.globalAlpha = 1;
    }
  }

  // a point on the ground just outside the room: tile (x, y) pushed `d` tiles along the world direction (dx, dy)
  const outside = (x: number, y: number, dx: number, dy: number, d: number): [number, number] => {
    const [i0, j0] = map(0, 0);
    const [i1, j1] = map(dx, dy);
    const [ti, tj] = map(x, y);
    const i = ti + (i1 - i0) * d;
    const j = tj + (j1 - j0) * d;
    return [sx(i, j), sy(i, j)];
  };
  // does the world direction (dx, dy) point toward the viewer?
  const toward = (dx: number, dy: number): boolean => {
    const [i0, j0] = map(0, 0);
    const [i1, j1] = map(dx, dy);
    return i1 - i0 + (j1 - j0) > 0;
  };
  if (opts.labels) {
    // like a chessboard: columns 1..w and rows 1..h (from the bottom), always on the two front edges so
    // brick stacks never cover them; which edges those are depends on the view. Each number sits on the
    // ground on its own tile's diagonal, clear of the floor's side face.
    const south = toward(0, 1);
    const east = toward(1, 0);
    ctx.fillStyle = opts.labelColor ?? P.karelDark;
    ctx.font = `600 ${Math.max(9, Math.round(W * 0.32))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let x = 0; x < world.w; x++) {
      const [px, py] = outside(x, south ? world.h - 1 : 0, 0, south ? 1 : -1, 1.3);
      ctx.fillText(String(x + 1), px, py);
    }
    for (let y = 0; y < world.h; y++) {
      const [px, py] = outside(east ? world.w - 1 : 0, y, east ? 1 : -1, 0, 1.3);
      ctx.fillText(String(world.h - y), px, py);
    }
  }
}

/** Unit vector of world north on screen for a view: the direction a compass needle drawn over the map should take. */
export function northOnScreen(view: View): [number, number] {
  const { map } = rotated({ w: 2, h: 2 } as World, view);
  const [i0, j0] = map(0, 0);
  const [i1, j1] = map(0, -1);
  const dx = i1 - i0 - (j1 - j0);
  const dy = (i1 - i0 + (j1 - j0)) / 2;
  const d = Math.hypot(dx, dy);
  return [dx / d, dy / d];
}

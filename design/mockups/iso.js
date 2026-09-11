// Shared isometric renderer for the design mockups.
// Cubes as three-face paths, painter's order far -> near, view rotation 0..3.
// Not production code: just enough to make the proposals honest.

const DEMO_WORLD = {
  w: 10, h: 8,
  karel: { x: 2, y: 5, dir: 0 },
  tiles: (() => {
    const t = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) t.push({ removed: false, bricks: 0, mark: false });
    const at = (x, y) => t[y * 10 + x];
    // a staircase
    at(4, 5).bricks = 1; at(5, 5).bricks = 2; at(6, 5).bricks = 3; at(7, 5).bricks = 4;
    // a wall
    for (let x = 1; x <= 6; x++) at(x, 2).bricks = 2;
    at(6, 2).bricks = 3; at(7, 2).bricks = 1;
    // a pit
    at(8, 1).removed = true; at(9, 1).removed = true; at(9, 2).removed = true;
    // marks
    at(0, 7).mark = true; at(3, 5).mark = true; at(6, 5).mark = true; at(8, 6).mark = true; at(2, 0).mark = true;
    return t;
  })(),
};

function rotate(world, view) {
  const { w, h } = world;
  const rw = view % 2 ? h : w, rh = view % 2 ? w : h;
  const map = (x, y) => {
    switch (view & 3) {
      case 0: return [x, y];
      case 1: return [y, w - 1 - x];
      case 2: return [w - 1 - x, h - 1 - y];
      default: return [h - 1 - y, x];
    }
  };
  return { rw, rh, map };
}

function hash(...n) {
  let h = 2166136261;
  for (const v of n) { h ^= (v * 977) | 0; h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * (1 + f))));
  g = Math.max(0, Math.min(255, Math.round(g * (1 + f))));
  b = Math.max(0, Math.min(255, Math.round(b * (1 + f))));
  return `rgb(${r},${g},${b})`;
}

function renderWorld(canvas, opts) {
  const world = opts.world || DEMO_WORLD;
  const view = opts.view || 0;
  const P = opts.palette;
  const texture = opts.texture ?? true;
  const outline = opts.outline ?? null; // color or null
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const { rw, rh, map } = rotate(world, view);
  // fit
  const maxLevels = 6;
  const Wfit = cssW / (rw + rh) * 0.92;
  const Hfit = cssH / ((rw + rh) / 2 + maxLevels * 0.7) * 0.92;
  const W = Math.min(Wfit, Hfit, opts.maxTile || 44);
  const H = W / 2, Z = W * 0.62, FZ = W * 0.28;
  const ox = cssW / 2 + (rh - rw) * W / 2 * 0 + (opts.shiftX || 0);
  const oy = (cssH - (rw + rh) * H) / 2 + maxLevels * 0.25 * Z + (opts.shiftY || 0);
  const sx = (i, j) => ox + (i - j) * W;
  const sy = (i, j) => oy + (i + j) * H;

  function quad(pts, fill, strokeCol) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (strokeCol) { ctx.strokeStyle = strokeCol; ctx.lineWidth = 1; ctx.stroke(); }
  }
  // face param: origin + u*du + v*dv
  function face(o, du, dv, color, seed, faceId) {
    const corner = (u, v) => [o[0] + u * du[0] + v * dv[0], o[1] + u * du[1] + v * dv[1]];
    quad([corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)], color);
    if (texture) {
      const n = 4;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const r = hash(seed, faceId, a, b);
        if (r < 0.55) continue;
        const f = r < 0.75 ? -0.06 : (r < 0.9 ? 0.05 : -0.11);
        quad([corner(a / n, b / n), corner((a + 1) / n, b / n), corner((a + 1) / n, (b + 1) / n), corner(a / n, (b + 1) / n)], shade(color, f));
      }
    }
    if (outline) quad([corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)], 'transparent', outline);
  }
  // box centered on tile (i,j), footprint half-width hw (<=W), from z0 to z1 (pixels up)
  function box(i, j, hw, z0, z1, cols, seed) {
    const cx = sx(i, j), cy = sy(i, j); // tile center at ground
    const hh = hw / 2;
    const L = [cx - hw, cy], T = [cx, cy - hh], R = [cx + hw, cy], B = [cx, cy + hh];
    const up = (p, z) => [p[0], p[1] - z];
    // left face: Ltop, Btop, Bbot, Lbot
    face(up(L, z1), [B[0] - L[0], B[1] - L[1]], [0, z1 - z0], cols.left, seed, 1);
    face(up(B, z1), [R[0] - B[0], R[1] - B[1]], [0, z1 - z0], cols.right, seed, 2);
    face(up(L, z1), [T[0] - L[0], T[1] - L[1]], [B[0] - L[0], B[1] - L[1]], cols.top, seed, 0);
  }
  function markAt(i, j, z) {
    const cx = sx(i, j), cy = sy(i, j) - z - 0.5;
    const hw = W * 0.5, hh = hw / 2;
    quad([[cx - hw, cy], [cx, cy - hh], [cx + hw, cy], [cx, cy + hh]], P.mark, P.markEdge || null);
    if (P.markInner) {
      const w2 = W * 0.3, h2 = w2 / 2;
      quad([[cx - w2, cy], [cx, cy - h2], [cx + w2, cy], [cx, cy + h2]], P.markInner);
    }
  }
  function karelAt(i, j, z, rel) {
    const bw = W * 0.5, bh = Z * 1.05;
    const hw = W * 0.36, hh = Z * 0.55;
    const gap = Z * 0.08;
    // feet / treads
    box(i, j, W * 0.42, z, z + Z * 0.16, { top: P.karelDark, left: P.karelDark, right: P.karelDark }, 9001);
    // body
    box(i, j, bw, z + Z * 0.16, z + Z * 0.16 + bh, { top: P.karelTop, left: P.karelLeft, right: P.karelRight }, 9002);
    // head
    const hz0 = z + Z * 0.16 + bh + gap;
    box(i, j, hw, hz0, hz0 + hh, { top: P.karelTop, left: P.karelLeft, right: P.karelRight }, 9003);
    // visor on visible faces: rel 0 -> right face (+i), rel 3 -> left face (+j)
    const cx = sx(i, j), cy = sy(i, j);
    const vz = hz0 + hh * 0.35, vh = hh * 0.3;
    if (rel === 0) {
      const B = [cx, cy + hw / 2], R = [cx + hw, cy];
      const a = 0.2, b = 0.8;
      const p = (t, dz) => [B[0] + (R[0] - B[0]) * t, B[1] + (R[1] - B[1]) * t - dz];
      quad([p(a, vz), p(b, vz), p(b, vz + vh), p(a, vz + vh)], P.visor);
    } else if (rel === 3) {
      const L = [cx - hw, cy], B = [cx, cy + hw / 2];
      const a = 0.2, b = 0.8;
      const p = (t, dz) => [L[0] + (B[0] - L[0]) * t, L[1] + (B[1] - L[1]) * t - dz];
      quad([p(a, vz), p(b, vz), p(b, vz + vh), p(a, vz + vh)], P.visor);
    }
    // direction arrow on head top
    const tz = hz0 + hh + 0.5;
    const c = [cx, cy - tz];
    const dirs = [[hw * 0.7, hw * 0.35], [hw * 0.7, -hw * 0.35], [-hw * 0.7, -hw * 0.35], [-hw * 0.7, hw * 0.35]]; // +i, -j, -i, +j
    const d = dirs[rel];
    const perp = [-d[1] * 0.5, d[0] * 0.5];
    quad([[c[0] + d[0], c[1] + d[1]], [c[0] - d[0] * 0.3 + perp[0], c[1] - d[1] * 0.3 + perp[1]], [c[0] - d[0] * 0.3 - perp[0], c[1] - d[1] * 0.3 - perp[1]]], P.visor);
  }

  // painter's order: far (small i+j) to near
  const cells = [];
  for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) cells.push([i, j]);
  cells.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || (a[1] - b[1]));
  const kx = world.karel.x, ky = world.karel.y;
  const rel = ((world.karel.dir - view) % 4 + 4) % 4;

  // ground shadow plate
  if (P.plate) {
    const pad = W * 0.35;
    const c = (i, j, dz) => [sx(i, j), sy(i, j) + dz];
    const L = c(0, rh - 1, 0), T = c(0, 0, 0), R = c(rw - 1, 0, 0), B = c(rw - 1, rh - 1, 0);
    quad([[L[0] - W - pad, L[1] + 3], [T[0], T[1] - H - pad / 2 + 3], [R[0] + W + pad, R[1] + 3], [B[0], B[1] + H + pad / 2 + 3]], P.plate);
  }

  for (const [i, j] of cells) {
    // find world coords for this rotated cell: invert map by brute force (fine for a mockup)
    let wx = -1, wy = -1;
    for (let y = 0; y < world.h && wx < 0; y++) for (let x = 0; x < world.w; x++) {
      const [a, b] = map(x, y); if (a === i && b === j) { wx = x; wy = y; break; }
    }
    const t = world.tiles[wy * world.w + wx];
    if (t.removed) {
      if (P.pit) {
        const cx = sx(i, j), cy = sy(i, j);
        quad([[cx - W, cy], [cx, cy - H], [cx + W, cy], [cx, cy + H]], P.pit);
      }
      continue;
    }
    box(i, j, W, 0, FZ, { top: P.floorTop, left: P.floorLeft, right: P.floorRight }, wx * 31 + wy);
    let z = FZ;
    for (let k = 0; k < t.bricks; k++) {
      box(i, j, W, z, z + Z, { top: P.brickTop, left: P.brickLeft, right: P.brickRight }, wx * 31 + wy + k * 7);
      z += Z;
    }
    if (t.mark) markAt(i, j, z);
    if (wx === kx && wy === ky) karelAt(i, j, z, rel);
  }
  return { W, H, Z };
}

window.KarelIso = { renderWorld, DEMO_WORLD };

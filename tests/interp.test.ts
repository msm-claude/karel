import { describe, expect, it } from 'vitest';
import { parse } from '../src/core/parser';
import { run, runToEnd } from '../src/core/interp';
import { decodeWorld, encodeWorld } from '../src/core/encode';
import { emptyWorld, MAX_BRICKS, resizeWorld } from '../src/core/world';
import { layout } from '../src/ui/render';
import { locales } from '../src/lang/index';

const sk = locales.sk;
const go = (src: string, world = emptyWorld(5, 4)) => runToEnd(parse(src, sk), world);

describe('interpreter golden runs', () => {
  it('walks and turns', () => {
    const r = go('krok krok vlavo krok');
    expect(r.ok).toBe(true);
    expect(r.world.karel).toEqual({ x: 2, y: 2, dir: 1 });
    expect(r.steps).toBe(4);
  });

  it('builds a staircase with repeat and marks', () => {
    // 5x4 room, karel at (0,3) facing east. Each round: place, step onto it? no: place ahead then step is height 1 - ok.
    const r = go('oznac opakuj 3 krat poloz krok koniec');
    expect(r.ok).toBe(true);
    const enc = encodeWorld(r.world);
    expect(enc).toBe('1.5x4.3,3,0.15AB3CA');
    expect(r.world.karel.x).toBe(3);
  });

  it('while with user condition', () => {
    const r = go(
      `podmienka volno-vpredu
         ak je mur tak nepravda inak pravda koniec
       koniec
       kym je volno-vpredu krok koniec`,
    );
    expect(r.ok).toBe(true);
    expect(r.world.karel.x).toBe(4);
  });

  it('is not negation', () => {
    const r = go('kym nie je mur krok koniec vlavo kym nie je mur krok koniec');
    expect(r.ok).toBe(true);
    expect(r.world.karel).toEqual({ x: 4, y: 0, dir: 1 });
  });

  it('runtime error carries the position of the failing statement', () => {
    const r = go('prikaz dopredu\n  krok\n  krok\nkoniec\ndopredu\ndopredu\ndopredu');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('wall');
    expect(r.pos).toEqual({ line: 2, col: 3 }); // 5th step = first krok of the 3rd call
    expect(r.world.karel.x).toBe(4);
    expect(r.steps).toBe(4);
  });

  it('place and pick rules', () => {
    expect(go('poloz poloz zdvihni').ok).toBe(true);
    expect(go('zdvihni').ok && 'no').toBe(false);
    // from the ground the reach rule (diff <= 9) fires before the cap
    const reach = go(`opakuj ${MAX_BRICKS + 1} krat poloz koniec`);
    expect(reach.ok).toBe(false);
    if (!reach.ok) expect(reach.code).toBe('placeReach');
    // standing high enough, the cap fires
    const high = emptyWorld(5, 4);
    high.tiles[15]!.bricks = 2;
    high.tiles[16]!.bricks = MAX_BRICKS;
    const full = go('poloz', high);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.code).toBe('placeFull');
    // cannot climb 2
    const climb = go('poloz poloz krok');
    expect(climb.ok).toBe(false);
    if (!climb.ok) expect(climb.code).toBe('tooHigh');
    // can drop any height: start on a 5-high stack, step onto the ground
    const tower = emptyWorld(5, 4);
    tower.tiles[15]!.bricks = 5;
    const drop = go('krok', tower);
    expect(drop.ok).toBe(true);
    expect(drop.world.karel.x).toBe(1);
    // volno agrees with step
    const vac = go('ak je volno tak krok koniec', tower);
    expect(vac.world.karel.x).toBe(1);
  });

  it('mark twice is an error, unmark restores', () => {
    expect(go('oznac oznac').ok).toBe(false);
    expect(go('oznac odznac oznac').ok).toBe(true);
  });

  it('infinite loop hits the step budget', () => {
    const r = runToEnd(parse('kym nie je znacka vlavo koniec', sk), emptyWorld(3, 3), { maxSteps: 500 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('budget');
  });

  it('unbounded recursion hits the depth limit', () => {
    const r = runToEnd(parse('prikaz a vlavo a koniec a', sk), emptyWorld(3, 3), { maxDepth: 20 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('depth');
  });

  it('condition without result is an error', () => {
    const r = go('podmienka nic krok koniec ak je nic tak krok koniec');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('condNoResult');
  });

  it('yields once per primitive and once per loop iteration', () => {
    const g = run(parse('opakuj 2 krat krok koniec', sk), emptyWorld(5, 5));
    let n = 0;
    let r = g.next();
    while (!r.done) {
      n++;
      r = g.next();
    }
    expect(n).toBe(4);
    expect(r.value.ok).toBe(true);
  });

  it('does not mutate the initial world', () => {
    const w = emptyWorld(3, 3);
    go('krok poloz oznac', w);
    expect(w.karel.x).toBe(0);
    expect(w.tiles.every((t) => t.bricks === 0 && !t.mark)).toBe(true);
  });
});

describe('room encoding', () => {
  it('round-trips the spec example', () => {
    const code = '1.12x8.0,0,0.B11AB25A4G54A';
    const w = decodeWorld(code);
    expect(w.tiles).toHaveLength(96);
    expect(w.tiles[0]).toEqual({ removed: false, bricks: 0, mark: true });
    expect(w.tiles[12 + 1 + 25]).toEqual({ removed: false, bricks: 3, mark: false });
    expect(encodeWorld(w)).toBe(code);
  });

  it('encodes removed tiles and karel', () => {
    const w = emptyWorld(3, 2);
    w.tiles[5]!.removed = true;
    w.karel = { x: 1, y: 0, dir: 2 };
    expect(encodeWorld(w)).toBe('1.3x2.1,0,2.5Az');
    expect(decodeWorld('1.3x2.1,0,2.5Az')).toEqual(w);
  });

  it('rejects broken codes', () => {
    expect(() => decodeWorld('1.3x2.0,0,0.5A')).toThrow();
    expect(() => decodeWorld('1.3x2.0,0,0.7A')).toThrow();
    expect(() => decodeWorld('2.3x2.0,0,0.6A')).toThrow();
    expect(() => decodeWorld('1.31x2.0,0,0.62A')).toThrow();
    expect(() => decodeWorld('1.3x2.5,0,0.6A')).toThrow();
    expect(() => decodeWorld('1.3x2.2,1,0.5Az')).toThrow(); // karel on removed tile
  });
});

describe('resizeWorld', () => {
  it('keeps school coordinates: grows right and at the top, karel follows', () => {
    const w = emptyWorld(3, 2);
    w.tiles[1 * 3 + 2]!.bricks = 4; // column 3, row 1 (bottom)
    w.karel = { x: 1, y: 1, dir: 2 };
    const big = resizeWorld(w, 4, 3);
    expect(big.tiles[2 * 4 + 2]!.bricks).toBe(4);
    expect(big.karel).toEqual({ x: 1, y: 2, dir: 2 });
    const small = resizeWorld(big, 2, 1);
    expect(small.karel).toEqual({ x: 1, y: 0, dir: 2 });
    expect(small.tiles.every((t) => t.bricks === 0)).toBe(true);
  });
  it('clamps karel back in and reopens his tile', () => {
    const w = emptyWorld(3, 3);
    w.karel = { x: 2, y: 0, dir: 0 };
    w.tiles[2 * 3 + 1]!.removed = true;
    const s = resizeWorld(w, 2, 1);
    expect(s.karel).toEqual({ x: 1, y: 0, dir: 0 });
    expect(s.tiles[1]!.removed).toBe(false);
  });
});

describe('layout hit test', () => {
  it('maps every tile centre back to the tile in all four views', () => {
    const w = emptyWorld(5, 3);
    for (const view of [0, 1, 2, 3] as const) {
      const L = layout(600, 400, w, view);
      for (let y = 0; y < w.h; y++)
        for (let x = 0; x < w.w; x++) {
          const [i, j] = L.map(x, y);
          const px = L.ox + (i - j) * L.W;
          const py = L.oy + (i + j) * L.H - L.FZ;
          const u = (px - L.ox) / L.W;
          const v = (py + L.FZ - L.oy) / L.H;
          const ri = Math.round((u + v) / 2);
          const rj = Math.round((v - u) / 2);
          expect(L.inv[rj * L.rw + ri]).toBe(y * w.w + x);
        }
    }
  });
});

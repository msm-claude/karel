// World model and rules. Pure, DOM-free. Semantics follow the original Karel 3D:
// a grid of tiles {removed, bricks, mark}, Karel {x, y, dir}. Wall = room edge
// or a removed tile. Mark is on Karel's tile, bricks are handled in front.

export type Dir = 0 | 1 | 2 | 3; // 0 east (+x), 1 north (-y), 2 west (-x), 3 south (+y)

export interface Tile {
  removed: boolean;
  bricks: number;
  mark: boolean;
}

export interface Karel {
  x: number;
  y: number;
  dir: Dir;
}

export interface World {
  w: number;
  h: number;
  tiles: Tile[]; // row-major, index = y * w + x
  karel: Karel;
}

export const MAX_BRICKS = 10;
export const MAX_SIZE = 30;

const DX = [1, 0, -1, 0] as const;
const DY = [0, -1, 0, 1] as const;

export type RuntimeErrorCode =
  | 'wall' // step into wall / room edge / removed tile
  | 'tooHigh' // step blocked by height difference > 1
  | 'placeWall' // nothing in front to place on
  | 'placeReach' // stack in front too far above or below
  | 'placeFull' // tile in front has MAX_BRICKS
  | 'pickWall' // nothing in front to pick from
  | 'pickEmpty' // no brick in front
  | 'pickReach' // brick in front out of reach
  | 'alreadyMarked'
  | 'noMark';

export class KarelRuntimeError extends Error {
  constructor(public readonly code: RuntimeErrorCode) {
    super(code);
  }
}

export function emptyWorld(w: number, h: number): World {
  const tiles: Tile[] = [];
  for (let i = 0; i < w * h; i++) tiles.push({ removed: false, bricks: 0, mark: false });
  return { w, h, tiles, karel: { x: 0, y: h - 1, dir: 0 } };
}

export function cloneWorld(world: World): World {
  return {
    w: world.w,
    h: world.h,
    tiles: world.tiles.map((t) => ({ ...t })),
    karel: { ...world.karel },
  };
}

export function tileAt(world: World, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return undefined;
  return world.tiles[y * world.w + x];
}

export function currentTile(world: World): Tile {
  const t = tileAt(world, world.karel.x, world.karel.y);
  if (!t) throw new Error('karel is outside the room');
  return t;
}

/** Tile in front of Karel, or undefined when that is the room edge or a removed tile. */
export function frontTile(world: World): Tile | undefined {
  const { x, y, dir } = world.karel;
  const t = tileAt(world, x + DX[dir], y + DY[dir]);
  return t && !t.removed ? t : undefined;
}

// Predicates

export function isWallAhead(world: World): boolean {
  return frontTile(world) === undefined;
}

export function isBrickAhead(world: World): boolean {
  const f = frontTile(world);
  return f !== undefined && f.bricks > 0;
}

export function isMark(world: World): boolean {
  return currentTile(world).mark;
}

/** Karel can step forward: not a wall and the height difference is at most 1. */
export function isVacant(world: World): boolean {
  const f = frontTile(world);
  return f !== undefined && Math.abs(f.bricks - currentTile(world).bricks) <= 1;
}

// Commands. Each mutates the world in place and throws KarelRuntimeError when
// the rules forbid the action. Callers that need immutability clone first.

export function step(world: World): void {
  const f = frontTile(world);
  if (!f) throw new KarelRuntimeError('wall');
  if (Math.abs(f.bricks - currentTile(world).bricks) > 1) throw new KarelRuntimeError('tooHigh');
  const { dir } = world.karel;
  world.karel.x += DX[dir];
  world.karel.y += DY[dir];
}

export function turnLeft(world: World): void {
  world.karel.dir = ((world.karel.dir + 1) % 4) as Dir;
}

export function turnRight(world: World): void {
  world.karel.dir = ((world.karel.dir + 3) % 4) as Dir;
}

export function placeBrick(world: World): void {
  const f = frontTile(world);
  if (!f) throw new KarelRuntimeError('placeWall');
  const diff = f.bricks - currentTile(world).bricks;
  if (diff < -1 || diff > 9) throw new KarelRuntimeError('placeReach');
  if (f.bricks >= MAX_BRICKS) throw new KarelRuntimeError('placeFull');
  f.bricks += 1;
}

export function pickBrick(world: World): void {
  const f = frontTile(world);
  if (!f) throw new KarelRuntimeError('pickWall');
  if (f.bricks === 0) throw new KarelRuntimeError('pickEmpty');
  const diff = f.bricks - currentTile(world).bricks;
  if (diff < 0 || diff > 10) throw new KarelRuntimeError('pickReach');
  f.bricks -= 1;
}

export function setMark(world: World): void {
  const t = currentTile(world);
  if (t.mark) throw new KarelRuntimeError('alreadyMarked');
  t.mark = true;
}

export function clearMark(world: World): void {
  const t = currentTile(world);
  if (!t.mark) throw new KarelRuntimeError('noMark');
  t.mark = false;
}

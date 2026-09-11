// Interpreter as a generator: yields once per primitive command and once per
// loop iteration. The run driver decides pacing; this module never touches a timer.
import type { Cond, Pos, Program, Stmt } from './ast';
import {
  clearMark,
  cloneWorld,
  isBrickAhead,
  isMark,
  isVacant,
  isWallAhead,
  KarelRuntimeError,
  pickBrick,
  placeBrick,
  setMark,
  step,
  turnLeft,
  turnRight,
  type World,
} from './world';

export interface Tick {
  pos: Pos;
  world: World; // the live world; clone if you keep it
  steps: number; // primitives executed so far
}

export type RunResult =
  | { ok: true; world: World; steps: number }
  | { ok: false; code: string; pos: Pos; world: World; steps: number };

export interface RunOptions {
  maxSteps?: number;
  maxDepth?: number;
}

class Budget extends Error {
  constructor(
    public readonly code: 'budget' | 'depth' | 'condNoResult',
    public readonly pos: Pos,
  ) {
    super(code);
  }
}

class CondResult {
  constructor(public readonly value: boolean) {}
}

export function* run(program: Program, initial: World, opts: RunOptions = {}): Generator<Tick, RunResult, void> {
  const maxSteps = opts.maxSteps ?? 100_000;
  const maxDepth = opts.maxDepth ?? 200;
  const world = cloneWorld(initial);
  let steps = 0;
  let depth = 0;
  let curPos: Pos = { line: 1, col: 1 };

  function* tick(pos: Pos): Generator<Tick, void, void> {
    if (steps >= maxSteps) throw new Budget('budget', pos);
    yield { pos, world, steps };
  }

  function* evalCond(c: Cond): Generator<Tick, boolean, void> {
    switch (c.kind) {
      case 'wallAhead':
        return isWallAhead(world);
      case 'brickAhead':
        return isBrickAhead(world);
      case 'mark':
        return isMark(world);
      case 'vacant':
        return isVacant(world);
      case 'not':
        return !(yield* evalCond(c.cond));
      case 'userCond': {
        const def = program.conds.get(c.name);
        if (!def) throw new Budget('condNoResult', c.pos); // parser guarantees existence
        if (depth >= maxDepth) throw new Budget('depth', c.pos);
        depth++;
        try {
          yield* execBlock(def.body, /*frame*/ {});
        } catch (e) {
          if (e instanceof CondResult) return e.value;
          throw e;
        } finally {
          depth--;
        }
        throw new Budget('condNoResult', c.pos);
      }
    }
  }

  // `frame` is intentionally empty in v1; variables land here later.
  function* execBlock(body: Stmt[], frame: Record<string, never>): Generator<Tick, void, void> {
    for (const s of body) yield* exec(s, frame);
  }

  function* exec(s: Stmt, frame: Record<string, never>): Generator<Tick, void, void> {
    curPos = s.pos;
    switch (s.kind) {
      case 'primitive': {
        switch (s.op) {
          case 'step':
            step(world);
            break;
          case 'left':
            turnLeft(world);
            break;
          case 'right':
            turnRight(world);
            break;
          case 'place':
            placeBrick(world);
            break;
          case 'pick':
            pickBrick(world);
            break;
          case 'mark':
            setMark(world);
            break;
          case 'unmark':
            clearMark(world);
            break;
        }
        steps++;
        yield* tick(s.pos);
        return;
      }
      case 'call': {
        const def = program.procs.get(s.name);
        if (!def) return; // parser guarantees existence
        if (depth >= maxDepth) throw new Budget('depth', s.pos);
        depth++;
        try {
          yield* execBlock(def.body, frame);
        } finally {
          depth--;
        }
        return;
      }
      case 'result':
        throw new CondResult(s.value);
      case 'repeat': {
        const n = s.count.value;
        for (let i = 0; i < n; i++) {
          yield* tick(s.pos);
          yield* execBlock(s.body, frame);
        }
        return;
      }
      case 'while': {
        while (yield* evalCond(s.cond)) {
          yield* tick(s.pos);
          yield* execBlock(s.body, frame);
        }
        return;
      }
      case 'if': {
        if (yield* evalCond(s.cond)) yield* execBlock(s.then, frame);
        else if (s.else) yield* execBlock(s.else, frame);
        return;
      }
    }
  }

  try {
    yield* execBlock(program.main, {});
    return { ok: true, world, steps };
  } catch (e) {
    if (e instanceof KarelRuntimeError) return { ok: false, code: e.code, pos: curPos, world, steps };
    if (e instanceof Budget) return { ok: false, code: e.code, pos: e.pos, world, steps };
    if (e instanceof CondResult) return { ok: true, world, steps }; // `pravda` at top level: harmless
    throw e;
  }
}

/** Run to completion without pacing. Used by tests and by "run at full speed". */
export function runToEnd(program: Program, initial: World, opts?: RunOptions): RunResult {
  const g = run(program, initial, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

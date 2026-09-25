// Run driver: pulls the interpreter generator on a timer. Run / step / stop /
// speed live here and never touch the interpreter.
import type { Program } from '../core/ast';
import { run, type RunResult, type Tick } from '../core/interp';
import type { World } from '../core/world';

export type DriverState = 'idle' | 'running' | 'paused' | 'finished';

export interface DriverEvents {
  onTick(tick: Tick): void;
  onEnd(result: RunResult): void;
  onState(state: DriverState): void;
}

/**
 * speed 1..MAX_SPEED -> pace of one tick. A delay of 0 means "per animation frame": 5 runs one tick a frame
 * (~60 ticks/s, still watchable), 6 empties the generator as fast as the frames allow.
 */
const PACE = [
  { delay: 700, perFrame: 1 },
  { delay: 350, perFrame: 1 },
  { delay: 150, perFrame: 1 },
  { delay: 50, perFrame: 1 },
  { delay: 0, perFrame: 1 },
  { delay: 0, perFrame: 40 },
] as const;
export const MAX_SPEED = PACE.length;

export class Driver {
  private gen: Generator<Tick, RunResult, void> | null = null;
  private timer: { kind: 'raf' | 'timeout'; id: number } | null = null;
  private _state: DriverState = 'idle';
  private _speed = 3;

  constructor(private readonly events: DriverEvents) {}

  get state(): DriverState {
    return this._state;
  }

  get speed(): number {
    return this._speed;
  }

  setSpeed(s: number): void {
    this._speed = Math.max(1, Math.min(MAX_SPEED, Math.round(s)));
  }

  /** Arm a fresh run. Does not advance. */
  load(program: Program, world: World): void {
    this.cancelTimer();
    this.gen = run(program, world);
    this.setState('paused');
  }

  private setState(s: DriverState): void {
    if (this._state === s) return;
    this._state = s;
    this.events.onState(s);
  }

  /** Advance one tick. Returns false when the run finished. */
  private advance(): boolean {
    if (!this.gen) return false;
    const r = this.gen.next();
    if (r.done) {
      this.gen = null;
      this.cancelTimer();
      this.setState('finished');
      this.events.onEnd(r.value);
      return false;
    }
    this.events.onTick(r.value);
    return true;
  }

  start(): void {
    if (!this.gen) return;
    this.setState('running');
    this.schedule();
  }

  private schedule(): void {
    this.cancelTimer();
    const { delay, perFrame } = PACE[this._speed - 1] ?? PACE[2]!;
    if (delay === 0) {
      const id = requestAnimationFrame(() => {
        this.timer = null;
        for (let k = 0; k < perFrame; k++) if (!this.advance()) return;
        if (this._state === 'running') this.schedule();
      });
      this.timer = { kind: 'raf', id };
    } else {
      const id = window.setTimeout(() => {
        this.timer = null;
        if (this.advance() && this._state === 'running') this.schedule();
      }, delay);
      this.timer = { kind: 'timeout', id };
    }
  }

  /** Single step: pauses a running program, then advances one tick. */
  step(): void {
    if (!this.gen) return;
    this.cancelTimer();
    this.setState('paused');
    this.advance();
  }

  pause(): void {
    if (this._state !== 'running') return;
    this.cancelTimer();
    this.setState('paused');
  }

  /** Abandon the run. The world stays where it is; reset is the caller's job. */
  stop(): void {
    this.cancelTimer();
    this.gen = null;
    this.setState('idle');
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    if (this.timer.kind === 'raf') cancelAnimationFrame(this.timer.id);
    else clearTimeout(this.timer.id);
    this.timer = null;
  }
}

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

/** speed 1..5 -> ms between ticks; 5 = as fast as the frame allows */
const DELAYS = [0, 700, 350, 150, 50, 0] as const;
const TICKS_PER_FRAME_AT_MAX = 40;

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
    this._speed = Math.max(1, Math.min(5, Math.round(s)));
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
    const delay = DELAYS[this._speed] ?? 150;
    if (delay === 0) {
      const id = requestAnimationFrame(() => {
        this.timer = null;
        for (let k = 0; k < TICKS_PER_FRAME_AT_MAX; k++) if (!this.advance()) return;
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

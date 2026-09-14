// The task data model and its bridge to the app's world. Coordinates in the tasks are the
// school's: columns 1..w from the left, rows 1..h from the bottom, directions N/E/S/W.
import { encodeWorld } from '../src/core/encode';
import { emptyWorld, type Dir, type World } from '../src/core/world';

export type SchoolDir = 'N' | 'E' | 'S' | 'W';

export interface SchoolWorld {
  w: number;
  h: number;
  karel: [number, number, SchoolDir];
  bricks?: Record<string, number>;
  marks?: string[];
  blocked?: string[];
}

export interface TaskMap {
  pre: SchoolWorld;
  post: SchoolWorld;
}

export interface Task {
  id: string;
  level: number;
  type?: 'trace' | 'bug';
  app?: 'old';
  title: string;
  concept: string;
  text: string;
  hint: string | null;
  expect?: 'error' | 'infinite';
  run?: string;
  /** the program that is part of the task: the one to read (trace) or the broken one (bug) */
  program?: string;
  maps: TaskMap[];
}

export interface Level {
  id: number;
  title: string;
  intro: string;
  concept: string | null;
  app?: 'old';
}

export interface Concept {
  name: string;
  desc: string;
  tasks: string[];
}

export interface Tasks {
  levels: Level[];
  concepts: Concept[];
  tasks: Task[];
}

const DIR: Record<SchoolDir, Dir> = { E: 0, N: 1, W: 2, S: 3 };

export function toWorld(s: SchoolWorld): World {
  const world = emptyWorld(s.w, s.h);
  const at = (key: string) => {
    const [c, r] = key.split(',').map(Number) as [number, number];
    return world.tiles[(s.h - r) * s.w + (c - 1)]!;
  };
  for (const [key, n] of Object.entries(s.bricks ?? {})) at(key).bricks = n;
  for (const key of s.marks ?? []) at(key).mark = true;
  for (const key of s.blocked ?? []) at(key).removed = true;
  const [c, r, d] = s.karel;
  world.karel = { x: c - 1, y: s.h - r, dir: DIR[d] };
  return world;
}

export function mapCode(s: SchoolWorld): string {
  return encodeWorld(toWorld(s));
}

/** Save-file format of karelrobot.cz, for the tasks that still run there (js/source/room.js saveRoom). */
export function karelFile(task: Task, pre: SchoolWorld): unknown {
  const bricks = pre.bricks ?? {};
  const marks = pre.marks ?? [];
  const blocked = pre.blocked ?? [];
  const room: Record<number, Record<number, { bricks: number; mark: boolean; inRoom: boolean }>> = {};
  for (let x = 0; x < pre.w; x++) {
    room[x] = {};
    for (let y = 0; y < pre.h; y++) {
      const key = `${pre.w - x},${y + 1}`;
      room[x]![y] = { bricks: bricks[key] ?? 0, mark: marks.includes(key), inRoom: !blocked.includes(key) };
    }
  }
  const APP_DIR: Record<SchoolDir, number> = { S: 0, W: 1, N: 2, E: 3 };
  const [c, r, d] = pre.karel;
  const file: Record<string, unknown> = { lang: 'cs', karelAndRoom: { room, karel: { position: [pre.w - c, r - 1], orientation: APP_DIR[d] } } };
  if (task.program) file['code'] = task.program;
  return file;
}

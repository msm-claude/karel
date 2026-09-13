// Golden tests for the task sheet: every Karel-app solution turns PRED into PO on every map.
// Tasks that still run on karelrobot.cz (app: "old") are checked by ulohy/tools/check.py.
import { describe, expect, it } from 'vitest';
import { encodeWorld } from '../src/core/encode';
import { runToEnd } from '../src/core/interp';
import { parse } from '../src/core/parser';
import { locales } from '../src/lang/index';
import data from '../ulohy/tasks.json';
import solutions from '../ulohy/solutions.json';
import { toWorld, type Tasks } from '../ulohy/world';

const DATA = data as unknown as Tasks;
const SOL = solutions as unknown as Record<string, { solution: string; why: string }>;
const sk = locales.sk;

describe('task sheet data', () => {
  it('ids are unique and every concept points at a real task', () => {
    const ids = DATA.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of DATA.concepts) for (const id of c.tasks) expect(ids, `${c.name} -> ${id}`).toContain(id);
  });
  it('every task has at least one map and a solution', () => {
    for (const t of DATA.tasks) {
      expect(t.maps.length, t.id).toBeGreaterThan(0);
      expect(SOL[t.id], t.id).toBeDefined();
    }
  });
});

describe('Karel-app solutions turn PRED into PO', () => {
  for (const t of DATA.tasks) {
    if (t.app === 'old' || t.type === 'manual') continue;
    it(`${t.id} ${t.title}`, () => {
      const program = parse(SOL[t.id]!.solution, sk);
      t.maps.forEach((m, i) => {
        const r = runToEnd(program, toWorld(m.pre), { maxSteps: 20_000, maxDepth: 200 });
        const label = `${t.id} mapa ${i + 1}`;
        if (t.expect === 'infinite') {
          expect(r.ok, `${label}: expected an endless run`).toBe(false);
          if (!r.ok) expect(['depth', 'budget']).toContain(r.code);
        } else {
          if (t.expect === 'error') expect(r.ok, `${label}: expected an error`).toBe(false);
          else expect(r.ok ? 'ok' : `error ${r.code} at line ${r.pos.line}`, label).toBe('ok');
          expect(encodeWorld(r.world), label).toBe(encodeWorld(toWorld(m.post)));
        }
      });
      if (t.type === 'bug') {
        const r = runToEnd(parse(t.program!, sk), toWorld(t.maps[0]!.pre), { maxSteps: 20_000 });
        expect(r.ok && encodeWorld(r.world) === encodeWorld(toWorld(t.maps[0]!.post)), `${t.id}: the buggy program already reaches PO`).toBe(false);
      }
    });
  }
});

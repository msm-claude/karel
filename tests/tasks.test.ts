// Golden tests for the task sheet: every Karel-app solution turns PRED into PO on every map.
import { describe, expect, it } from 'vitest';
import { encodeWorld } from '../src/core/encode';
import { runToEnd } from '../src/core/interp';
import { parse } from '../src/core/parser';
import { localeIds, locales } from '../src/lang/index';
import { translate } from '../src/core/translate';
import cs from '../tasks/strings.cs.json';
import en from '../tasks/strings.en.json';
import skStrings from '../tasks/strings.sk.json';
import data from '../tasks/tasks.json';
import solutions from '../tasks/solutions.json';
import { toWorld, type Strings, type Tasks } from '../tasks/world';

const DATA = data as unknown as Tasks;
const STRINGS = { sk: skStrings, cs, en } as unknown as Record<string, Strings>;
const SOL = solutions as unknown as Record<string, { solution: string; why: string }>;
const sk = locales.sk;

describe('task sheet data', () => {
  it('every language has the same strings, none empty', () => {
    const paths = (o: unknown, p = ''): string[] =>
      o !== null && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => paths(v, `${p}${k}.`)) : [p];
    const skPaths = paths(STRINGS['sk']).sort();
    for (const [id, s] of Object.entries(STRINGS)) {
      expect(paths(s).sort(), id).toEqual(skPaths);
      for (const lv of DATA.levels) expect(s.levels[String(lv.id)]?.title, `${id} level ${lv.id}`).toBeTruthy();
      for (const t of DATA.tasks) {
        const st = s.tasks[t.id];
        expect(st?.title && st.text && st.concept, `${id} task ${t.id}`).toBeTruthy();
      }
      for (const v of Object.values(s.ui)) expect(v).toBeTruthy();
    }
  });
  it('every task program translates and parses in every language', () => {
    for (const t of DATA.tasks) {
      if (!t.program) continue;
      for (const id of localeIds) expect(() => parse(translate(t.program!, sk, locales[id]), locales[id]), `${t.id} ${id}`).not.toThrow();
    }
  });
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
    it(`${t.id} ${STRINGS['sk']!.tasks[t.id]!.title}`, () => {
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

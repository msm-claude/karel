import { describe, expect, it } from 'vitest';
import { parse, ParseError, scanDefinedNames } from '../src/core/parser';
import { locales } from '../src/lang/index';

const sk = locales.sk;

describe('parser', () => {
  it('parses definitions, loops and conditions', () => {
    const p = parse(
      `prikaz schody
         opakuj 3 krat poloz krok koniec
       koniec
       podmienka volna-cesta
         ak je mur tak nepravda inak pravda koniec
       koniec
       kym je volna-cesta krok koniec
       schody`,
      sk,
    );
    expect([...p.procs.keys()]).toEqual(['schody']);
    expect([...p.conds.keys()]).toEqual(['volna-cesta']);
    expect(p.main.map((s) => s.kind)).toEqual(['while', 'call']);
    const w = p.main[0]!;
    if (w.kind !== 'while') throw new Error();
    expect(w.cond).toMatchObject({ kind: 'userCond', name: 'volna-cesta' });
  });

  it('is locale independent: same AST from sk and en', () => {
    const a = parse('opakuj 2 krat ak nie je mur tak krok inak vlavo koniec koniec', sk);
    const b = parse('repeat 2 times if is not wall then step else left end end', locales.en);
    const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'pos' ? undefined : v)));
    expect(strip(a.main)).toEqual(strip(b.main));
  });

  it('accepts diacritics and capitals in input', () => {
    const p = parse('Vľavo\nPOLOŽ\nkým je múr vpravo koniec', sk);
    expect(p.main.map((s) => s.kind)).toEqual(['primitive', 'primitive', 'while']);
  });

  it('ignores comments', () => {
    const p = parse('krok # dopredu\n# cely riadok\nvlavo', sk);
    expect(p.main).toHaveLength(2);
  });

  it('reports unknown names with position', () => {
    try {
      parse('krok\n  tancuj', sk);
      throw new Error('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).pos).toEqual({ line: 2, col: 3 });
      expect((e as ParseError).message).toContain('tancuj');
    }
  });

  it('rejects a keyword as a name and duplicates', () => {
    expect(() => parse('prikaz krok koniec', sk)).toThrow(ParseError);
    expect(() => parse('prikaz a koniec prikaz a koniec', sk)).toThrow(/definované/);
  });

  it('rejects nested definitions and missing end', () => {
    expect(() => parse('prikaz a prikaz b koniec koniec', sk)).toThrow(ParseError);
    expect(() => parse('opakuj 2 krat krok', sk)).toThrow(/koniec/);
  });

  it('scanDefinedNames is a cheap regex over lines', () => {
    expect(scanDefinedNames('prikaz Schody\n  krok\nkoniec\npodmienka voľná\nkoniec', sk)).toEqual({
      procs: ['schody'],
      conds: ['volna'],
    });
  });
});

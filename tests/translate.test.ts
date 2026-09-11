import { describe, expect, it } from 'vitest';
import { translate } from '../src/core/translate';
import { parse } from '../src/core/parser';
import { locales } from '../src/lang/index';

const src = `prikaz schody  # komentar kym je
  opakuj 3 krat
    poloz
    krok
  koniec
koniec
kym nie je mur schody koniec
ak je znacka tak odznac inak oznac koniec`;

describe('translate', () => {
  it('sk -> en keeps layout and comments', () => {
    const en = translate(src, locales.sk, locales.en);
    expect(en).toBe(`command schody  # komentar kym je
  repeat 3 times
    put
    step
  end
end
while is not wall schody end
if is marked then unmark else mark end`);
  });
  it('round-trips through every locale and parses identically', () => {
    const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'pos' ? undefined : v)));
    const base = strip(parse(src, locales.sk).main);
    const cs = translate(src, locales.sk, locales.cs);
    const en = translate(cs, locales.cs, locales.en);
    const back = translate(en, locales.en, locales.sk);
    expect(strip(parse(cs, locales.cs).main)).toEqual(base);
    expect(strip(parse(en, locales.en).main)).toEqual(base);
    expect(back).toBe(src);
  });
  it('translates diacritic input to canonical words', () => {
    expect(translate('Vľavo\nkým nie je múr krok koniec', locales.sk, locales.en)).toBe('left\nwhile is not wall step end');
  });
});

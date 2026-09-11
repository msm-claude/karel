// Translate a program's keywords from one locale to another. The AST is
// locale-independent, so this is a word-level substitution that keeps
// whitespace, comments and identifiers untouched.
import type { Keyword, Locale } from '../lang/types';
import { normalize } from '../lang/index';

export function translate(source: string, from: Locale, to: Locale): string {
  if (from.id === to.id) return source;
  const single = new Map<string, Keyword>();
  const pairs = new Map<string, Keyword>();
  for (const [kw, words] of Object.entries(from.keywords) as [Keyword, string][]) {
    if (words.includes(' ')) pairs.set(words, kw);
    else single.set(words, kw);
  }
  return source
    .split('\n')
    .map((line) => {
      const hash = line.indexOf('#');
      const code = hash >= 0 ? line.slice(0, hash) : line;
      const comment = hash >= 0 ? line.slice(hash) : '';
      const parts = code.split(/(\s+)/); // words and separators interleaved
      const out: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const w = parts[i]!;
        if (/^\s*$/.test(w)) {
          out.push(w);
          continue;
        }
        const n = normalize(w);
        const nextWord = parts[i + 2];
        if (nextWord !== undefined) {
          const pair = pairs.get(`${n} ${normalize(nextWord)}`);
          if (pair) {
            out.push(to.keywords[pair]);
            i += 2;
            continue;
          }
        }
        const kw = single.get(n);
        out.push(kw ? to.keywords[kw] : w);
      }
      return out.join('') + comment;
    })
    .join('\n');
}

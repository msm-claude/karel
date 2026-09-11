import type { Keyword, Locale } from '../lang/types';
import { normalize } from '../lang/index';
import type { Pos } from './ast';

export type Token =
  | { kind: 'kw'; kw: Keyword; text: string; pos: Pos }
  | { kind: 'ident'; text: string; pos: Pos }
  | { kind: 'number'; value: number; text: string; pos: Pos }
  | { kind: 'eof'; text: string; pos: Pos };

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly pos: Pos,
  ) {
    super(message);
  }
}

/**
 * Split source into words, then map localized words to canonical keywords.
 * Two-word keywords (`nie je`, `is not`) are matched greedily before single words.
 * `#` starts a comment to end of line.
 */
export function lex(source: string, locale: Locale): Token[] {
  const single = new Map<string, Keyword>();
  const pairs = new Map<string, Keyword>(); // "first second" -> kw
  for (const [kw, words] of Object.entries(locale.keywords) as [Keyword, string][]) {
    const parts = words.split(' ');
    if (parts.length === 2) pairs.set(parts.join(' '), kw);
    else single.set(words, kw);
  }

  const raw: { text: string; norm: string; pos: Pos }[] = [];
  const lines = source.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? '';
    const re = /[^\s#]+|#/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m[0] === '#') break;
      raw.push({ text: m[0], norm: normalize(m[0]), pos: { line: li + 1, col: m.index + 1 } });
    }
  }

  const tokens: Token[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i]!;
    const next = raw[i + 1];
    if (next) {
      const pair = pairs.get(`${cur.norm} ${next.norm}`);
      if (pair) {
        tokens.push({ kind: 'kw', kw: pair, text: `${cur.text} ${next.text}`, pos: cur.pos });
        i++;
        continue;
      }
    }
    const kw = single.get(cur.norm);
    if (kw) {
      tokens.push({ kind: 'kw', kw, text: cur.text, pos: cur.pos });
    } else if (/^\d+$/.test(cur.norm)) {
      tokens.push({ kind: 'number', value: Number(cur.norm), text: cur.text, pos: cur.pos });
    } else if (/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(cur.norm)) {
      tokens.push({ kind: 'ident', text: cur.norm, pos: cur.pos });
    } else {
      throw new ParseError(locale.parse.unexpected(cur.text), cur.pos);
    }
  }
  const last = raw[raw.length - 1];
  const eofPos: Pos = last ? { line: last.pos.line, col: last.pos.col + last.text.length } : { line: 1, col: 1 };
  tokens.push({ kind: 'eof', text: locale.parse.eof, pos: eofPos });
  return tokens;
}

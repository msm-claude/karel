// Recursive-descent parser for the v1 grammar (docs/grammar.ebnf).
import type { Keyword, Locale } from '../lang/types';
import type { Cond, CondDef, Expr, Pos, Primitive, ProcDef, Program, Stmt } from './ast';
import { lex, ParseError, type Token } from './lexer';
import { normalize } from '../lang/index';

export { ParseError } from './lexer';

const PRIMITIVES: Partial<Record<Keyword, Primitive>> = {
  step: 'step',
  left: 'left',
  right: 'right',
  place: 'place',
  pick: 'pick',
  mark: 'mark',
  unmark: 'unmark',
};

const PREDICATES: Partial<Record<Keyword, 'wallAhead' | 'brickAhead' | 'mark' | 'vacant'>> = {
  wall: 'wallAhead',
  brick: 'brickAhead',
  marked: 'mark',
  vacant: 'vacant',
};

class Parser {
  private i = 0;
  private readonly procs = new Map<string, ProcDef>();
  private readonly conds = new Map<string, CondDef>();
  private readonly calls: { name: string; pos: Pos; asCond: boolean }[] = [];

  constructor(
    private readonly tokens: Token[],
    private readonly locale: Locale,
  ) {}

  private peek(): Token {
    return this.tokens[this.i]!;
  }

  private advance(): Token {
    const t = this.peek();
    if (t.kind !== 'eof') this.i++;
    return t;
  }

  private isKw(kw: Keyword): boolean {
    const t = this.peek();
    return t.kind === 'kw' && t.kw === kw;
  }

  private expectKw(kw: Keyword): Token {
    const t = this.peek();
    if (t.kind === 'kw' && t.kw === kw) return this.advance();
    throw new ParseError(this.locale.parse.expected(`„${this.locale.keywords[kw]}“`, t.text), t.pos);
  }

  private expectIdent(): { name: string; pos: Pos } {
    const t = this.peek();
    if (t.kind === 'ident') {
      this.advance();
      return { name: t.text, pos: t.pos };
    }
    if (t.kind === 'kw') throw new ParseError(this.locale.parse.nameIsKeyword(t.text), t.pos);
    throw new ParseError(this.locale.parse.expected(this.locale.parse.name, t.text), t.pos);
  }

  program(): Program {
    const main: Stmt[] = [];
    while (this.peek().kind !== 'eof') {
      if (this.isKw('proc')) this.procDef();
      else if (this.isKw('cond')) this.condDef();
      else main.push(this.statement());
    }
    for (const c of this.calls) {
      const known = c.asCond ? this.conds.has(c.name) : this.procs.has(c.name);
      if (!known) throw new ParseError(this.locale.parse.unknownName(c.name), c.pos);
    }
    return { procs: this.procs, conds: this.conds, main };
  }

  private procDef(): void {
    const pos = this.expectKw('proc').pos;
    const { name } = this.expectIdent();
    if (this.procs.has(name) || this.conds.has(name)) throw new ParseError(this.locale.parse.duplicateName(name), pos);
    const body = this.block();
    this.expectKw('end');
    this.procs.set(name, { kind: 'proc', name, body, pos });
  }

  private condDef(): void {
    const pos = this.expectKw('cond').pos;
    const { name } = this.expectIdent();
    if (this.procs.has(name) || this.conds.has(name)) throw new ParseError(this.locale.parse.duplicateName(name), pos);
    const body = this.block();
    this.expectKw('end');
    this.conds.set(name, { kind: 'cond', name, body, pos });
  }

  /** Statements until a block-closing keyword (`end`, `else`) or eof. */
  private block(): Stmt[] {
    const out: Stmt[] = [];
    while (!this.isKw('end') && !this.isKw('else') && this.peek().kind !== 'eof') {
      if (this.isKw('proc') || this.isKw('cond')) {
        const t = this.peek();
        throw new ParseError(this.locale.parse.unexpected(t.text), t.pos);
      }
      out.push(this.statement());
    }
    return out;
  }

  private statement(): Stmt {
    const t = this.peek();
    if (t.kind === 'ident') {
      this.advance();
      this.calls.push({ name: t.text, pos: t.pos, asCond: false });
      return { kind: 'call', name: t.text, pos: t.pos };
    }
    if (t.kind === 'kw') {
      const prim = PRIMITIVES[t.kw];
      if (prim) {
        this.advance();
        return { kind: 'primitive', op: prim, pos: t.pos };
      }
      switch (t.kw) {
        case 'true':
        case 'false':
          this.advance();
          return { kind: 'result', value: t.kw === 'true', pos: t.pos };
        case 'repeat': {
          this.advance();
          const count = this.expr();
          this.expectKw('times');
          const body = this.block();
          this.expectKw('end');
          return { kind: 'repeat', count, body, pos: t.pos };
        }
        case 'while': {
          this.advance();
          const cond = this.cond();
          const body = this.block();
          this.expectKw('end');
          return { kind: 'while', cond, body, pos: t.pos };
        }
        case 'if': {
          this.advance();
          const cond = this.cond();
          this.expectKw('then');
          const then = this.block();
          let els: Stmt[] | undefined;
          if (this.isKw('else')) {
            this.advance();
            els = this.block();
          }
          this.expectKw('end');
          return els ? { kind: 'if', cond, then, else: els, pos: t.pos } : { kind: 'if', cond, then, pos: t.pos };
        }
        default:
          break;
      }
    }
    throw new ParseError(this.locale.parse.unexpected(t.text), t.pos);
  }

  private expr(): Expr {
    const t = this.peek();
    if (t.kind === 'number') {
      this.advance();
      return { kind: 'literal', value: t.value, pos: t.pos };
    }
    throw new ParseError(this.locale.parse.number(t.text), t.pos);
  }

  /** `is <pred>` | `is not <pred>` */
  private cond(): Cond {
    const t = this.peek();
    let negate = false;
    if (t.kind === 'kw' && t.kw === 'isNot') negate = true;
    else if (!(t.kind === 'kw' && t.kw === 'is')) {
      throw new ParseError(
        this.locale.parse.expected(`„${this.locale.keywords.is}“ / „${this.locale.keywords.isNot}“`, t.text),
        t.pos,
      );
    }
    this.advance();
    const p = this.peek();
    let inner: Cond;
    if (p.kind === 'kw' && PREDICATES[p.kw]) {
      this.advance();
      inner = { kind: PREDICATES[p.kw]!, pos: p.pos };
    } else if (p.kind === 'ident') {
      this.advance();
      this.calls.push({ name: p.text, pos: p.pos, asCond: true });
      inner = { kind: 'userCond', name: p.text, pos: p.pos };
    } else {
      throw new ParseError(this.locale.parse.unexpected(p.text), p.pos);
    }
    return negate ? { kind: 'not', cond: inner, pos: t.pos } : inner;
  }
}

export function parse(source: string, locale: Locale): Program {
  return new Parser(lex(source, locale), locale).program();
}

/** Names defined in the source, cheap regex scan for autocomplete (no full parse needed). */
export function scanDefinedNames(source: string, locale: Locale): { procs: string[]; conds: string[] } {
  const procs: string[] = [];
  const conds: string[] = [];
  const procKw = locale.keywords.proc;
  const condKw = locale.keywords.cond;
  for (const line of source.split('\n')) {
    const words = line.trim().split(/\s+/);
    if (words.length < 2) continue;
    const head = normalize(words[0]!);
    const name = normalize(words[1]!);
    if (head === procKw) procs.push(name);
    else if (head === condKw) conds.push(name);
  }
  return { procs, conds };
}


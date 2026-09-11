// Locale-independent AST. The lexer maps localized words to these canonical
// shapes, so a program parsed from Slovak and one parsed from English compare equal.

export interface Pos {
  line: number; // 1-based
  col: number; // 1-based
}

export type Expr = { kind: 'literal'; value: number; pos: Pos };

export type Cond =
  | { kind: 'wallAhead'; pos: Pos }
  | { kind: 'brickAhead'; pos: Pos }
  | { kind: 'mark'; pos: Pos }
  | { kind: 'vacant'; pos: Pos }
  | { kind: 'userCond'; name: string; pos: Pos }
  | { kind: 'not'; cond: Cond; pos: Pos };

export type Primitive = 'step' | 'left' | 'right' | 'place' | 'pick' | 'mark' | 'unmark';

export type Stmt =
  | { kind: 'primitive'; op: Primitive; pos: Pos }
  | { kind: 'call'; name: string; pos: Pos }
  | { kind: 'result'; value: boolean; pos: Pos }
  | { kind: 'repeat'; count: Expr; body: Stmt[]; pos: Pos }
  | { kind: 'while'; cond: Cond; body: Stmt[]; pos: Pos }
  | { kind: 'if'; cond: Cond; then: Stmt[]; else?: Stmt[]; pos: Pos };

export interface ProcDef {
  kind: 'proc';
  name: string;
  body: Stmt[];
  pos: Pos;
}

export interface CondDef {
  kind: 'cond';
  name: string;
  body: Stmt[];
  pos: Pos;
}

export interface Program {
  procs: Map<string, ProcDef>;
  conds: Map<string, CondDef>;
  main: Stmt[];
}

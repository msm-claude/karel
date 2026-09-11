// A locale is one keyword table plus message tables. Keywords are written
// without diacritics; input is normalized the same way before matching, so a
// child typing `vľavo` still hits `vlavo`.

export type Keyword =
  | 'proc'
  | 'end'
  | 'cond'
  | 'step'
  | 'left'
  | 'right'
  | 'place'
  | 'pick'
  | 'mark'
  | 'unmark'
  | 'repeat'
  | 'times'
  | 'while'
  | 'is'
  | 'isNot'
  | 'if'
  | 'then'
  | 'else'
  | 'wall'
  | 'brick'
  | 'marked'
  | 'vacant'
  | 'true'
  | 'false';

export type LocaleId = 'sk' | 'cs' | 'en';

export interface Locale {
  id: LocaleId;
  name: string;
  /** canonical keyword -> localized word(s). Multi-word entries are space separated. */
  keywords: Record<Keyword, string>;
  /** parse error messages */
  parse: {
    unexpected: (found: string) => string;
    expected: (what: string, found: string) => string;
    unknownName: (name: string) => string;
    duplicateName: (name: string) => string;
    nameIsKeyword: (name: string) => string;
    number: (found: string) => string;
    eof: string;
    name: string;
  };
  /** runtime error messages by code */
  runtime: Record<string, string>;
  /** UI strings */
  ui: Record<string, string>;
}

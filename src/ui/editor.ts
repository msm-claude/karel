// CodeMirror 6 editor: a StreamLanguage built from the locale dictionary,
// autocomplete from keywords plus user-defined names, and two line markers
// (running line, error line) driven by effects.
import { autocompletion, closeBrackets, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language';
import { Compartment, EditorState, StateEffect, type StateEffectType, StateField, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { scanDefinedNames } from '../core/parser';
import { normalize } from '../lang/index';
import type { Keyword, Locale } from '../lang/types';

const STRUCTURAL: Keyword[] = ['proc', 'end', 'cond', 'repeat', 'times', 'while', 'is', 'isNot', 'if', 'then', 'else'];
const PRIMITIVES: Keyword[] = ['step', 'left', 'right', 'place', 'pick', 'mark', 'unmark'];
const PREDICATES: Keyword[] = ['wall', 'brick', 'marked', 'vacant', 'true', 'false'];

function language(locale: Locale) {
  const cls = new Map<string, string>();
  const pairs = new Map<string, string>(); // first word -> full normalized pair
  for (const [kw, words] of Object.entries(locale.keywords) as [Keyword, string][]) {
    const style = STRUCTURAL.includes(kw) ? 'keyword' : PRIMITIVES.includes(kw) ? 'builtin' : 'atom';
    cls.set(words, style);
    if (words.includes(' ')) pairs.set(words.split(' ')[0]!, words);
  }
  return StreamLanguage.define<Record<string, never>>({
    token(stream: StringStream): string | null {
      if (stream.eatSpace()) return null;
      if (stream.peek() === '#') {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.match(/^\d+/)) return 'number';
      const m = stream.match(/^[^\s#]+/) as RegExpMatchArray | null;
      if (!m) {
        stream.next();
        return null;
      }
      const word = normalize(m[0]);
      const pair = pairs.get(word);
      if (pair) {
        const rest = pair.slice(word.length); // " je"
        const look = stream.match(new RegExp(`^\\s+${rest.trim()}(?=\\s|$)`, 'i'), false) as RegExpMatchArray | null;
        if (look) {
          stream.match(/^\s+[^\s#]+/);
          return cls.get(pair) ?? null;
        }
      }
      return cls.get(word) ?? 'variableName';
    },
    languageData: { commentTokens: { line: '#' } },
  });
}

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: '#7a3fd1', fontWeight: '600' },
  { tag: t.standard(t.variableName), color: '#1f7a3e' }, // builtin
  { tag: t.atom, color: '#b3541e' },
  { tag: t.number, color: '#17212b', fontWeight: '600' },
  { tag: t.comment, color: '#8a98a6', fontStyle: 'italic' },
  { tag: t.variableName, color: '#17212b' },
]);

function completer(locale: Locale) {
  const detail: Partial<Record<Keyword, string>> = {
    proc: locale.ui['refProc'] ?? '',
    cond: locale.ui['refCond'] ?? '',
    repeat: locale.ui['refRepeat'] ?? '',
    while: locale.ui['refWhile'] ?? '',
    if: locale.ui['refIf'] ?? '',
    step: locale.ui['refStep'] ?? '',
    left: locale.ui['refLeft'] ?? '',
    right: locale.ui['refRight'] ?? '',
    place: locale.ui['refPlace'] ?? '',
    pick: locale.ui['refPick'] ?? '',
    mark: locale.ui['refMark'] ?? '',
    unmark: locale.ui['refUnmark'] ?? '',
  };
  const keywordOptions = (Object.entries(locale.keywords) as [Keyword, string][]).map(([kw, label]) => ({
    label,
    type: STRUCTURAL.includes(kw) ? 'keyword' : PRIMITIVES.includes(kw) ? 'function' : 'constant',
    detail: detail[kw],
    boost: PRIMITIVES.includes(kw) ? 1 : 0,
  }));
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\p{L}\p{N}_-]*/u);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    const names = scanDefinedNames(ctx.state.doc.toString(), locale);
    const user = [
      ...names.procs.map((label) => ({ label, type: 'function', boost: 2 })),
      ...names.conds.map((label) => ({ label, type: 'variable', boost: 2 })),
    ];
    return { from: word.from, options: [...user, ...keywordOptions], validFor: /^[\p{L}\p{N}_-]*$/u };
  };
}

// line markers

const setRunLine = StateEffect.define<number | null>();
const setErrorLine = StateEffect.define<number | null>();
const runMark = Decoration.line({ class: 'cm-runLine' });
const errMark = Decoration.line({ class: 'cm-errorLine' });

function lineField(effect: StateEffectType<number | null>, mark: Decoration) {
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      deco = deco.map(tr.changes);
      for (const e of tr.effects) {
        if (e.is(effect)) {
          if (e.value === null || e.value < 1 || e.value > tr.state.doc.lines) deco = Decoration.none;
          else deco = Decoration.set([mark.range(tr.state.doc.line(e.value).from)]);
        }
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

const runField = lineField(setRunLine, runMark);
const errField = lineField(setErrorLine, errMark);

export class Editor {
  readonly view: EditorView;
  private readonly lang = new Compartment();
  private readonly complete = new Compartment();
  private readonly readOnly = new Compartment();

  constructor(parent: HTMLElement, doc: string, locale: Locale, onChange: () => void) {
    const ext: Extension[] = [
      lineNumbers(),
      history(),
      closeBrackets(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      this.lang.of(language(locale)),
      syntaxHighlighting(highlight),
      this.complete.of(autocompletion({ override: [completer(locale)], activateOnTyping: true })),
      this.readOnly.of(EditorState.readOnly.of(false)),
      runField,
      errField,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange();
      }),
    ];
    this.view = new EditorView({ state: EditorState.create({ doc, extensions: ext }), parent });
  }

  get text(): string {
    return this.view.state.doc.toString();
  }

  setText(text: string): void {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
  }

  setLocale(locale: Locale): void {
    this.view.dispatch({
      effects: [this.lang.reconfigure(language(locale)), this.complete.reconfigure(autocompletion({ override: [completer(locale)] }))],
    });
  }

  setRunLine(line: number | null): void {
    this.view.dispatch({ effects: setRunLine.of(line) });
    if (line !== null && line >= 1 && line <= this.view.state.doc.lines) {
      this.view.dispatch({ effects: EditorView.scrollIntoView(this.view.state.doc.line(line).from, { y: 'nearest' }) });
    }
  }

  setErrorLine(line: number | null): void {
    this.view.dispatch({ effects: setErrorLine.of(line) });
  }

  setReadOnly(ro: boolean): void {
    this.view.dispatch({ effects: this.readOnly.reconfigure(EditorState.readOnly.of(ro)) });
  }

  focus(): void {
    this.view.focus();
  }
}

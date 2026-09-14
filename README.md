# karel

Karel the robot for Slovak homeschool: isometric, localizable, programs
written by hand. A reimplementation of [Robot Karel 3D](https://karelrobot.cz)
without the 3D engine, the block editor and the server. Design record: #1.

## What it is

- A static page: a canvas with an isometric room, a text editor, six controls.
- Slovak by default, Czech and English as free extras. Switching the language
  translates the program; keywords carry no diacritics in any language.
- Rooms travel in the link. `#m=` is the room, `#p=` an optional program,
  `#l=` the language. A room link opens with an empty editor. No accounts, no server.

## Language

```
prikaz schody
  opakuj 3 krat
    poloz
    krok
  koniec
koniec

schody
kym nie je mur
  krok
koniec
oznac
```

Words: `prikaz … koniec`, `podmienka … koniec` (ends with `pravda` or
`nepravda`), `krok`, `vlavo`, `vpravo`, `poloz`, `zdvihni`, `oznac`, `odznac`,
`opakuj N krat … koniec`, `kym je / nie je … koniec`, `ak … tak … inak …
koniec`, predicates `mur`, `tehla`, `znacka`, `volno`. `#` starts a comment.
Input is matched without diacritics and case, so `Vľavo` works too.
Grammar: [`docs/grammar.ebnf`](docs/grammar.ebnf).

Rules follow the original: a step is allowed when the tile ahead is at most
one brick higher (dropping down any height is fine); a brick can be placed when the stack in front is at most one
below or nine above Karel, up to ten per tile; a mark sits on Karel's own tile.

## Room links

```
#m=1.<w>x<h>.<kx>,<ky>,<dir>.<tiles>
```

Tiles row-major, one letter each: `z` is a removed tile, otherwise the letter
index is `bricks * 2 + mark` over `A..Z a..y`. A repeated letter takes a decimal
count prefix. `1.12x8.0,0,0.B11AB25A4G54A` is a 12×8 room with one mark, one
brick and a 3-high wall. The encoding is versioned; v1 stays decodable.

To make a room: open the Room tab and click the floor. The tools add or
remove a brick, toggle a mark, dig or fill a hole, and move Karel (a click on
his own tile turns him). Bricks go translucent while editing so every floor
tile stays reachable; width and height resize the room in place, keeping the
content and the column/row numbers. Every edit becomes the room, so Reset and
the shared link return to it.

The task sheet offers "Kopírovať" over every map; "Vložiť zo schránky" in the
Room tab loads it. The room-code field applies itself on paste or when it
loses focus, so a code can also travel as plain text.

## Tasks

The task sheet for 3. ročník is published at `/ulohy/` from [`ulohy/`](ulohy/):
79 tasks with maps drawn by the app's renderer and a link into the app for every
map. Solutions stay in `ulohy/solutions.json` and are verified by `npm test`
against the core; they are not shown on the page.

## Development

```
npm ci
npm run dev      # http://localhost:5173
npm test         # vitest, core golden tests
npm run build    # tsc + vite -> dist/
```

Layout: `src/core` (world rules, lexer, parser, generator interpreter, link
encoding; pure, no DOM), `src/lang` (keyword and message tables per language),
`src/ui` (canvas renderer, run driver, CodeMirror editor, page wiring),
`ulohy/` (the task sheet, a second Vite entry).
Dependencies point one way: `ui → lang → core`. `design/mockups` holds the
static HTML mockups the look was picked from.

Deploys to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`).

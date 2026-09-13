# ulohy

The task sheet: 79 tasks in 10 levels for 3. ročník, published next to the app at
`/ulohy/`. Assignment only: no progress, no passwords, no solutions on the page.

- `tasks.json` — levels, concepts and tasks. A task has `maps: [{pre, post}, …]`;
  every map gets its own "Otvor v Karlovi" link (`../#m=…&l=sk`). Tasks of type
  `trace` (read the program, guess PO) and `bug` (fix the program) carry the program
  in `program` and the link adds `&p=…`. Tasks with `app: "old"` still run on
  karelrobot.cz (manual control, variables; see msm-claude/karel#6) and offer a
  `.karel` save file instead of a link.
- `solutions.json` — one solution and explanation per task id. Read by the tests,
  not by the page.
- `index.html` + `ulohy.ts` + `world.ts` — the page. Maps are drawn by the app's own
  `renderWorld` with tile numbers, so a map on the sheet and in the app is the same
  picture. `world.ts` holds the data model and the bridge from the sheet's
  coordinates (columns from the left, rows from the bottom) to the app's world.
- `tests/ulohy.test.ts` — every Karel-app solution runs in the core on every map and
  must produce PO (`expect: error` tasks must stop with an error on PO,
  `expect: infinite` must hit the depth or step limit; a `bug` task's broken program
  must not reach PO). Runs with `npm test`.
- `tools/check.py` — simulator of karelrobot.cz semantics for the `app: "old"` tasks:
  `python3 ulohy/tools/check.py ulohy/tasks.json`.
- `tools/apptest-karelrobot.cjs` — the same in the live karelrobot.cz app (playwright):
  `NODE_PATH=/opt/homebrew/lib/node_modules/@playwright/cli/node_modules node ulohy/tools/apptest-karelrobot.cjs ulohy/tasks.json`.

The sheet started life in the private school repo (`smitalm/gepeto-school`,
`matej/2026-2027-3-rocnik/informatika/zadania/karel`) with server-side ticks and a
parent password; it moved here on 2026-09-13 so the tasks live with the app.

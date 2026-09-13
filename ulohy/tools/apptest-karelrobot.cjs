#!/usr/bin/env node
// Runs every karelrobot.cz task's (app: "old") solution in the live karelrobot.cz app (headless Chromium) and compares
// the resulting room with the expected "post" world from karel-progresia.html.
//
// Usage:
//   NODE_PATH=/opt/homebrew/lib/node_modules/@playwright/cli/node_modules \
//     node ulohy/tools/apptest-karelrobot.cjs ulohy/tasks.json [ids...] [--shots DIR]
//
// The .karel save file is built by a copy of karelFile() from ulohy/world.ts, so this also tests
// that the downloadable files load without "Načítaný soubor je poškozený".
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const htmlPath = args[0];
const shotsIdx = args.indexOf("--shots");
const shotsDir = shotsIdx >= 0 ? args[shotsIdx + 1] : null;
const only = args.slice(1).filter((a, i) => a !== "--shots" && (shotsIdx < 0 || i + 1 !== shotsIdx + 1));

const tasksPath = htmlPath; // ulohy/tasks.json
const DATA = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
const SOL = JSON.parse(fs.readFileSync(path.join(path.dirname(tasksPath), "solutions.json"), "utf8"));
for (const t of DATA.tasks) {
  t.pre = t.maps[0].pre; t.post = t.maps[0].post; t.variants = t.maps.slice(1);
  t.solution = SOL[t.id].solution; if (t.type === "bug") t.buggy = t.program;
}
// Save-file format of karelrobot.cz; mirrors karelFile() in ulohy/world.ts.
const APP_DIR = { S: 0, W: 1, N: 2, E: 3 };
function karelFile(t) {
  const w = t.pre, bricks = w.bricks || {}, marks = w.marks || [], blocked = w.blocked || [];
  const room = {};
  for (let x = 0; x < w.w; x++) {
    room[x] = {};
    for (let y = 0; y < w.h; y++) {
      const key = `${w.w - x},${y + 1}`;
      room[x][y] = { bricks: bricks[key] || 0, mark: marks.includes(key), inRoom: !blocked.includes(key) };
    }
  }
  const [c, r, d] = w.karel;
  const type = t.type || "code";
  const file = { lang: "cs", karelAndRoom: { room, karel: { position: [w.w - c, r - 1], orientation: APP_DIR[d] } } };
  if (type === "trace") file.code = t.solution;
  else if (type === "bug") file.code = t.buggy;
  return file;
}
const expected = post => karelFile({ pre: post, type: "manual" }).karelAndRoom;

const APP = "https://karelrobot.cz/karel.html";
const RUN_TIMEOUT_MS = 90000;
const INFINITE_WAIT_MS = 15000;

function diffState(got, want) {
  const out = [];
  if (JSON.stringify(got.karel) !== JSON.stringify(want.karel)) out.push(`karel ${JSON.stringify(got.karel)} != ${JSON.stringify(want.karel)}`);
  for (const x of Object.keys(want.room)) for (const y of Object.keys(want.room[x])) {
    const g = got.room[x] && got.room[x][y], w = want.room[x][y];
    if (!g || g.bricks !== w.bricks || g.mark !== w.mark || g.inRoom !== w.inRoom)
      out.push(`cell x${x} y${y}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  // main.js is an ES module: expose its module-scoped objects on window.
  await page.route("**/js/main.js", async route => {
    const res = await route.fetch();
    const body = (await res.text()) + "\nwindow.__k = { mainInterpret, editor, workspace };\n";
    await route.fulfill({ response: res, body, headers: { ...res.headers(), "content-type": "application/javascript" } });
  });
  page.on("pageerror", e => console.log("  [pageerror]", String(e).split("\n")[0]));
  await page.goto(APP, { waitUntil: "load" });
  await page.waitForFunction(() => window.__k && window.__k.mainInterpret.dictionary && window.__k.mainInterpret.dictionary.keywords, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  async function runProgram(file, run, timeout = RUN_TIMEOUT_MS) {
    return page.evaluate(async ([file, run, timeout]) => {
      const { mainInterpret, editor, workspace } = window.__k;
      const consoleEl = document.querySelector("#console");
      consoleEl.innerHTML = "";
      if (mainInterpret.getRunning()) document.querySelector("#stop").click();
      mainInterpret.loadFromJSON(file, workspace);
      const loadLog = consoleEl.innerText.trim();
      if (loadLog) return { loadError: loadLog };
      const lines = editor.getValue().split("\n");
      const idx = lines.findIndex(l => l.trim() === "prikaz " + run);
      if (idx < 0) return { loadError: "run function not found: " + run };
      editor.gotoLine(idx + 1, 0);
      editor.selection.moveCursorTo(idx, 2);
      mainInterpret.command.speed = 0;
      mainInterpret.textEditorInterpret(editor);
      const t0 = Date.now();
      let timedOut = false;
      while (mainInterpret.getRunning()) {
        if (Date.now() - t0 > timeout) { timedOut = true; document.querySelector("#stop").click(); break; }
        await new Promise(r => setTimeout(r, 25));
      }
      await new Promise(r => setTimeout(r, 100));
      return { timedOut, ms: Date.now() - t0, console: consoleEl.innerText.trim(), state: mainInterpret.command.karel.saveRoomWithKarel() };
    }, [file, run, timeout]);
  }

  async function shot(name) {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shotsDir, name + ".png") });
  }

  let ok = 0, bad = 0, skipped = 0;
  const report = [];
  for (const t of DATA.tasks) {
    if (only.length && !only.includes(t.id)) continue;
    const type = t.type || "code";
    if (t.app !== "old") { skipped++; report.push(`${t.id} SKIP (Karel app, see karel-progresia-apptest.js)`); continue; }
    if (type === "manual") { skipped++; report.push(`${t.id} SKIP (ručne)`); continue; }
    const file = karelFile(t);
    const problems = [];

    if (type === "bug") {
      const r = await runProgram({ ...file, code: t.buggy }, t.run);
      if (r.loadError) problems.push("buggy load: " + r.loadError);
      else {
        const d = diffState(r.state, expected(t.post));
        if (!r.console && d.length === 0) problems.push("buggy program is NOT broken in the app (no console message, state matches)");
        report.push(`${t.id}   buggy: ${r.console ? "console=" + JSON.stringify(r.console) : "no console"}${d.length ? ", state differs" : ", state matches"}`);
      }
    }

    const r = await runProgram({ ...file, code: t.solution }, t.run, t.expect === "infinite" ? INFINITE_WAIT_MS : RUN_TIMEOUT_MS);
    if (r.loadError) problems.push("load: " + r.loadError);
    else if (t.expect === "infinite") {
      if (!r.timedOut) problems.push(`expected infinite run, finished in ${r.ms} ms; console=${JSON.stringify(r.console)}`);
      else report.push(`${t.id}   still running after ${INFINITE_WAIT_MS} ms, stopped (expected)`);
    } else if (t.expect === "error") {
      if (!r.console) problems.push(`expected a console error, got none (timedOut=${r.timedOut})`);
      else report.push(`${t.id}   console=${JSON.stringify(r.console)}`);
    } else {
      if (r.timedOut) problems.push("timed out");
      if (r.console) problems.push("console: " + JSON.stringify(r.console));
      problems.push(...diffState(r.state, expected(t.post)));
    }
    for (const [i, v] of (t.variants || []).entries()) {
      const rv = await runProgram({ ...karelFile({ ...t, pre: v.pre }), code: t.solution }, t.run);
      const label = `${t.id} mapa ${i + 2}`;
      if (rv.loadError) problems.push(label + " load: " + rv.loadError);
      else if (rv.timedOut) problems.push(label + " timed out");
      else if (rv.console) problems.push(label + " console: " + JSON.stringify(rv.console));
      else problems.push(...diffState(rv.state, expected(v.post)).map(d => label + " " + d));
    }
    if (shotsDir && only.length) await shot("task-" + t.id);
    if (problems.length) { bad++; report.push(`${t.id} BAD ${t.title}\n    ` + problems.join("\n    ")); }
    else { ok++; report.push(`${t.id} ok  ${t.title}${r.ms !== undefined ? " (" + r.ms + " ms)" : ""}${t.variants ? " +" + t.variants.length + " mapy" : ""}`); }
  }
  console.log(report.join("\n"));
  console.log(`\n${ok} ok, ${bad} bad, ${skipped} skipped`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

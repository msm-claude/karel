#!/usr/bin/env python3
"""Simulate karelrobot.cz (Karel 3D) semantics and verify every task that still runs there (app: "old"): sim(pre, solution) == post.
Usage: python3 ulohy/tools/check.py ulohy/tasks.json

Supports: prikaz/konec, udelej N krat/*udelej, dokud/*dokud, kdyz/tak/jinak/*kdyz, recursion,
lokalni/globalni promenna assignments, arithmetic and comparison expressions (integer, floor division),
task types trace/bug and expectations "error" / "infinite".
"""
import json, re, sys

sys.setrecursionlimit(20000)
def load(path):
    """path = ulohy/tasks.json; solutions.json sits next to it. Rebuilds the flat shape this checker grew up with."""
    import os
    tasks = json.load(open(path, encoding="utf-8"))
    sols = json.load(open(os.path.join(os.path.dirname(path), "solutions.json"), encoding="utf-8"))
    for t in tasks["tasks"]:
        t["pre"], t["post"] = t["maps"][0]["pre"], t["maps"][0]["post"]
        t["variants"] = t["maps"][1:]
        t["solution"] = sols[t["id"]]["solution"]
        t["why"] = sols[t["id"]]["why"]
        if t.get("type") == "bug":
            t["buggy"] = t["program"]
    return tasks

DIRV = {"N": (0, 1), "E": (1, 0), "S": (0, -1), "W": (-1, 0)}
ORDER = ["N", "E", "S", "W"]

class Err(Exception):
    pass

class Infinite(Exception):
    pass

class World:
    def __init__(self, w):
        self.w, self.h = w["w"], w["h"]
        self.x, self.y, self.d = w["karel"]
        self.bricks = {tuple(map(int, k.split(","))): v for k, v in (w.get("bricks") or {}).items()}
        self.marks = {tuple(map(int, k.split(","))) for k in (w.get("marks") or [])}
        self.blocked = {tuple(map(int, k.split(","))) for k in (w.get("blocked") or [])}
        self.errors = []   # console messages the app would print (program continues)
        self.bumps = 0     # krok into a wall: silent no-op in the app
    def front(self):
        dx, dy = DIRV[self.d]
        return (self.x + dx, self.y + dy)
    def is_wall(self):
        fx, fy = self.front()
        return not (1 <= fx <= self.w and 1 <= fy <= self.h) or (fx, fy) in self.blocked
    def b(self, p):
        return self.bricks.get(p, 0)
    def is_brick(self):
        return (not self.is_wall()) and self.b(self.front()) > 0
    def is_mark(self):
        return (self.x, self.y) in self.marks
    def is_vacant(self):
        return (not self.is_wall()) and self.b((self.x, self.y)) + 1 >= self.b(self.front())
    def krok(self):
        if not self.is_vacant():
            self.bumps += 1
            return
        self.x, self.y = self.front()
    def vlevo(self):
        self.d = ORDER[(ORDER.index(self.d) - 1) % 4]
    def vpravo(self):
        self.d = ORDER[(ORDER.index(self.d) + 1) % 4]
    def poloz(self):
        if self.is_wall():
            self.errors.append("poloz: stena"); return
        diff = self.b(self.front()) - self.b((self.x, self.y))
        if diff < -1 or diff > 9:
            self.errors.append("poloz: nedosiahne"); return
        self.bricks[self.front()] = self.b(self.front()) + 1
    def zvedni(self):
        if self.is_wall():
            self.errors.append("zvedni: stena"); return
        diff = self.b(self.front()) - self.b((self.x, self.y))
        if diff < 0 or diff > 10:
            self.errors.append("zvedni: nedosiahne"); return
        if self.b(self.front()) == 0:
            self.errors.append("zvedni: nič na zdvihnutie"); return
        self.bricks[self.front()] -= 1
        if self.bricks[self.front()] == 0:
            del self.bricks[self.front()]
    def oznac(self):
        if self.is_mark():
            self.errors.append("oznac: už označené"); return
        self.marks.add((self.x, self.y))
    def odznac(self):
        if not self.is_mark():
            self.errors.append("odznac: nie je označené"); return
        self.marks.discard((self.x, self.y))
    def state(self):
        return (self.x, self.y, self.d, dict(self.bricks), set(self.marks), set(self.blocked))

PRIMS = {"krok", "vlevo", "vpravo", "poloz", "zvedni", "oznac", "odznac", "rychle", "pomalu", "pip"}
CONDS = {"zed": "is_wall", "cihla": "is_brick", "znacka": "is_mark", "volno": "is_vacant"}
EXPR_RE = re.compile(r"^[\w\s\+\-\*/%<>=!()]+$")

def parse(text):
    """Parse program text (line based) into (commands dict, globals list of (name, expr))."""
    lines = [l.strip() for l in text.split("\n")]
    lines = [l for l in lines if l and not l.startswith("#")]
    cmds, globs = {}, []
    i = 0
    def block(i, enders):
        body = []
        while i < len(lines):
            toks = lines[i].split()
            t = toks[0]
            if t in enders:
                return body, i
            if t == "udelej":
                assert toks[-1] == "krat", lines[i]
                inner, i = block(i + 1, {"*udelej"})
                body.append(("do", " ".join(toks[1:-1]), inner)); i += 1
            elif t == "dokud":
                assert toks[1] in ("je", "neni"), lines[i]
                inner, i = block(i + 1, {"*dokud"})
                body.append(("while", toks[1] == "neni", " ".join(toks[2:]), inner)); i += 1
            elif t == "kdyz":
                assert toks[1] in ("je", "neni"), lines[i]
                cond = " ".join(toks[2:])
                if cond.endswith(" tak"):
                    cond = cond[:-4]; j = i + 1
                else:
                    assert lines[i + 1] == "tak", lines[i + 1]; j = i + 2
                then, i = block(j, {"jinak", "*kdyz"})
                els = []
                if lines[i] == "jinak":
                    els, i = block(i + 1, {"*kdyz"})
                body.append(("if", toks[1] == "neni", cond, then, els)); i += 1
            elif t in ("lokalni", "globalni"):
                assert toks[1] == "promenna" and toks[3] == "=", lines[i]
                body.append(("assign", t, toks[2], " ".join(toks[4:]))); i += 1
            else:
                assert len(toks) == 1, lines[i]
                body.append(("call", t)); i += 1
        raise Err("neočakávaný koniec")
    while i < len(lines):
        toks = lines[i].split()
        if toks[0] == "prikaz":
            body, i = block(i + 1, {"konec"})
            cmds[toks[1]] = body
            i += 1
        elif toks[0] == "globalni":
            assert toks[1] == "promenna" and toks[3] == "="
            globs.append((toks[2], " ".join(toks[4:]))); i += 1
        else:
            raise Err("očakávam prikaz: " + lines[i])
    return cmds, globs

class Machine:
    def __init__(self, world, cmds, globs):
        self.w, self.cmds = world, cmds
        self.globals = {}
        self.budget = 0
        for name, expr in globs:
            self.globals[name] = self.eval(expr, {})
    def eval(self, expr, local):
        assert EXPR_RE.match(expr), expr
        env = dict(self.globals); env.update(local)
        e = re.sub(r"(?<![/])/(?![/])", "//", expr)
        def var(mo):
            n = mo.group(0)
            if n not in env:
                raise Err("nedefinovaná premenná " + n)
            return str(env[n])
        e = re.sub(r"[A-Za-z_]\w*", var, e)
        return int(eval(e, {"__builtins__": {}}, {}))
    def cond(self, neg, c, local):
        if c in CONDS:
            v = getattr(self.w, CONDS[c])()
        else:
            v = self.eval(c, local) != 0
        return v != neg
    def call(self, name, depth):
        if depth > 2000:
            raise Infinite()
        self.run(self.cmds[name], {}, depth)
    def run(self, body, local, depth):
        for st in body:
            self.budget += 1
            if self.budget > 200000:
                raise Infinite()
            k = st[0]
            if k == "call":
                n = st[1]
                if n in PRIMS:
                    if n in ("rychle", "pomalu", "pip"):
                        continue
                    getattr(self.w, n)()
                elif n in self.cmds:
                    self.call(n, depth + 1)
                else:
                    raise Err("neznámy príkaz " + n)
            elif k == "do":
                for _ in range(self.eval(st[1], local)):
                    self.run(st[2], local, depth)
            elif k == "while":
                while self.cond(st[1], st[2], local):
                    self.run(st[3], local, depth)
            elif k == "if":
                if self.cond(st[1], st[2], local):
                    self.run(st[3], local, depth)
                else:
                    self.run(st[4], local, depth)
            elif k == "assign":
                val = self.eval(st[3], local)
                if st[1] == "lokalni":
                    local[st[2]] = val
                else:
                    self.globals[st[2]] = val

def execute(t, program, pre=None):
    """Run program on the task's PRE world (or the given one); returns (world, outcome), outcome in ok/infinite."""
    w = World(pre or t["pre"])
    try:
        cmds, globs = parse(program)
        Machine(w, cmds, globs).call(t["run"], 0)
        return w, "ok"
    except Infinite:
        return w, "infinite"
    except RecursionError:
        return w, "infinite"

def judge(t, pre, post, label):
    """Run the solution on one world; returns True when it produced the expected post."""
    expect = t.get("expect", "ok")
    want = World(post).state()
    w, outcome = execute(t, t["solution"], pre)
    if expect == "infinite":
        good = outcome == "infinite"
    elif expect == "error":
        good = outcome == "ok" and w.errors and w.state() == want
    else:
        good = outcome == "ok" and not w.errors and w.state() == want
    if good and w.bumps and expect != "infinite":
        print(f"WARN {label} solution walks into a wall {w.bumps}x (silent in the app)")
    if not good:
        print(f"FAIL {label} {t['title']}: outcome={outcome} errors={w.errors} bumps={w.bumps}\n  want {want}\n  got  {w.state()}")
    return good

if __name__ == "__main__":
    DATA = load(sys.argv[1])
    ok = bad = 0
    for t in DATA["tasks"]:
        if t.get("app") != "old":
            continue  # Karel-app tasks are verified in the app by karel-progresia-apptest.js
        good = judge(t, t["pre"], t["post"], t["id"])
        for i, v in enumerate(t.get("variants", []), start=2):
            good = judge(t, v["pre"], v["post"], f"{t['id']} mapa {i}") and good
        if t.get("type") == "bug":
            wb, ob = execute(t, t["buggy"])
            if ob == "ok" and not wb.errors and wb.state() == World(t["post"]).state():
                print(f"WARN {t['id']} buggy program is not actually broken (a wall bump alone is invisible)")
        if good:
            ok += 1
            print(f"OK   {t['id']} {t['title']}" + (f" (+{len(t['variants'])} mapy)" if t.get("variants") else ""))
        else:
            bad += 1
    print(f"\n{ok} ok, {bad} bad")
    sys.exit(1 if bad else 0)

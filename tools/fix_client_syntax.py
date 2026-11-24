# -*- coding: utf-8 -*-
"""Iteratively fix remaining syntax errors in recovered client.js."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

PATH = Path(r"D:\project\papa\wxnimi\js\client.js")


def check() -> str | None:
    p = subprocess.run(
        ["node", "--check", str(PATH)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if p.returncode == 0:
        return None
    return (p.stderr or p.stdout or "").strip()


def fix_line(line: str) -> str:
    # Broken toast: title: "提示""none"
    line = line.replace('title: "提示""none"', 'title: "提示", icon: "none"')
    line = line.replace('title: "提示"none"', 'title: "提示", icon: "none"')
    # title: "xxx""none"
    line = re.sub(r'title:\s*"([^"]*)"+"none"', r'title: "\1", icon: "none"', line)
    # Odd quotes on showToast line — rewrite safely
    if "showToast" in line and line.count('"') % 2 == 1:
        indent = re.match(r"^(\s*)", line).group(1)
        line = (
            f'{indent}try {{ wx.showToast({{ title: "提示", icon: "none", duration: 1400 }}); }} '
            f"catch (e) {{}}"
        )
    # textContent odd quotes
    if "textContent" in line and line.count('"') % 2 == 1:
        indent = re.match(r"^(\s*)", line).group(1)
        # keep assignment structure if possible
        if "statusEl.textContent" in line:
            if "第5关" in line or "levelRunCol === 5" in "".join([]):
                pass
            line = f'{indent}statusEl.textContent = "关卡进行中";'
        else:
            line = re.sub(r'=\s*"[^"]*$', '= "";', line)
    # fillText odd
    if "fillText" in line and line.count('"') % 2 == 1:
        line = re.sub(r'fillText\(\s*"[^"]*', 'fillText(""', line)
        if line.count('"') % 2 == 1:
            line = line.rstrip() + '");'
    return line


text = PATH.read_text(encoding="utf-8")
lines = text.splitlines()

for i in range(20):
    err = check()
    if not err:
        print("OK after", i, "passes")
        break
    # parse line number
    m = re.search(r"client\.js:(\d+)", err)
    if not m:
        print("UNPARSED ERROR:\n", err[:500])
        break
    ln = int(m.group(1))
    idx = ln - 1
    if idx < 0 or idx >= len(lines):
        print("bad line", ln)
        break
    old = lines[idx]
    new = fix_line(old)
    # also fix neighbors for multi-line toast
    if new == old:
        # force toast rewrite
        if "showToast" in old or (idx > 0 and "showToast" in lines[idx - 1]):
            new = re.sub(r'^(\s*).*$', r'\1try { wx.showToast({ title: "提示", icon: "none", duration: 1400 }); } catch (e) {}', old)
        elif "textContent" in old:
            new = re.sub(r'^(\s*).*$', r'\1statusEl.textContent = "关卡进行中";', old)
        else:
            print("CANNOT FIX", ln, old[:160])
            print(err[:400])
            break
    print(f"fix L{ln}: {old[:80]!r} -> {new[:80]!r}")
    lines[idx] = new
    PATH.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
else:
    print("still failing", check())

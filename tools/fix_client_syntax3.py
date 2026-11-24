# -*- coding: utf-8 -*-
"""Aggressively close truncated UTF-8 string literals that end with ?."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

PATH = Path(r"D:\project\papa\wxnimi\js\client.js")
BAK = Path(r"D:\project\papa\wxnimi\backup\pre-lazyload-20261123-070956\js\client.js")

bak_lines = BAK.read_text(encoding="utf-8").splitlines()


def ascii_key(s: str) -> str:
    t = re.sub(r"[\u4e00-\u9fff\ufffd]+", "§", s)
    t = re.sub(r"\?+", "§", t)
    return re.sub(r"\s+", " ", t).strip()


bak_map: dict[str, list[str]] = {}
for ln in bak_lines:
    bak_map.setdefault(ascii_key(ln), []).append(ln)


def check() -> tuple[int | None, str]:
    p = subprocess.run(
        ["node", "--check", str(PATH)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if p.returncode == 0:
        return None, ""
    err = (p.stderr or p.stdout or "").strip()
    m = re.search(r"client\.js:(\d+)", err)
    return (int(m.group(1)) if m else None), err


KNOWN = {
    'label: "? };': 'label: "断" };',
    'label: "? }': 'label: "断" }',
    'fullMessage || "连接中?;': 'fullMessage || "连接中…";',
    'myId ?? "?}': 'myId ?? "?"}',
    'myId ?? "? ·': 'myId ?? "?" ·',
}


def repair_line(line: str) -> str:
    for a, b in KNOWN.items():
        if a in line:
            return line.replace(a, b)

    # label: "? };
    line2 = re.sub(r'(label:\s*)"\?\s*}', r'\1"断" }', line)
    # "...? };  or "...? };
    line2 = re.sub(r'"([^"\n]*?)\?\s*}', r'"\1" }', line2)
    # "...?;
    line2 = re.sub(r'"([^"\n]*?)\?;', r'"\1";', line2)
    # "...?,
    line2 = re.sub(r'"([^"\n]*?)\?,', r'"\1",', line2)
    # "...?)
    line2 = re.sub(r'"([^"\n]*?)\?\)', r'"\1")', line2)
    # "...?]
    line2 = re.sub(r'"([^"\n]*?)\?\]', r'"\1"]', line2)
    # template `...?`
    line2 = re.sub(r'`([^`\n]*?)\?`', r'`\1`', line2)
    # template ending `...? ·
    line2 = re.sub(r'`([^`\n]*?)\?(?=\s*·)', r'`\1`', line2)
    # "....?  at end of line (unterminated)
    if line2.count('"') % 2 == 1:
        line2 = re.sub(r'"([^"\n]*)\?\s*$', r'"\1"', line2)
        if line2.count('"') % 2 == 1:
            # append closing quote before trailing comment / code end
            line2 = re.sub(r'"([^"\n]*?)\?(?=\s*(//|$|;|,|\)|\}))', r'"\1"', line2)
        if line2.count('"') % 2 == 1:
            # last resort: close at first ?
            line2 = re.sub(r'"([^"\n]*?)\?', r'"\1"', line2, count=1)

    if line2 != line:
        return line2

    cands = bak_map.get(ascii_key(line)) or []
    if cands:
        return min(cands, key=lambda x: abs(len(x) - len(line)))

    # showToast lines: neutralize
    if "showToast" in line and line.count('"') % 2 == 1:
        return re.sub(r"^(\s*)", r"\1// BROKEN ", line)
    if ("textContent" in line or "innerHTML" in line or "fillText" in line) and line.count('"') % 2 == 1:
        # close string at ?
        return re.sub(r'"([^"\n]*)\?', r'"\1"', line, count=1)

    return line


for step in range(200):
    lines = PATH.read_text(encoding="utf-8").splitlines()
    ln, err = check()
    if ln is None:
        print("SYNTAX OK after", step)
        break
    idx = ln - 1
    if idx < 0 or idx >= len(lines):
        print("bad", ln, err[:300])
        break
    old = lines[idx]
    new = repair_line(old)
    if new == old:
        print("FAIL", ln, old[:220])
        print(err[:500])
        break
    print(f"L{ln}: {old[:80]!r}")
    print(f"  -> {new[:80]!r}")
    lines[idx] = new
    PATH.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
else:
    print("still", check()[1][:400])

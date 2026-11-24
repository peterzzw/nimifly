# -*- coding: utf-8 -*-
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


def repair_line(line: str) -> str:
    # ("? + col + "?) / ("? + levelRunCol + "?)
    line2 = re.sub(
        r'\("\?\s*\+\s*(col|levelRunCol)\s*\+\s*"\??\"?\)',
        r'("第" + \1 + "关")',
        line,
    )
    line2 = re.sub(
        r'\("\?\s*\+\s*(col|levelRunCol)\s*\+\s*""\)',
        r'("第" + \1 + "关")',
        line2,
    )
    # unterminated "....?  at EOL / before ] ; ,  -> "...."
    line2 = re.sub(r'"([^"\n]*?)\?(?=["\]\),;])', r'"\1"', line2)
    line2 = re.sub(r'"([^"\n]*?)\?\s*$', r'"\1"', line2)
    line2 = re.sub(r'"([^"\n]*?)\?\]', r'"\1"]', line2)
    # "....?)  -> "....")
    line2 = re.sub(r'"([^"\n]*?)\?\)', r'"\1")', line2)
    # "....?; -> "....";
    line2 = re.sub(r'"([^"\n]*?)\?;', r'"\1";', line2)
    # "....?, -> "....",
    line2 = re.sub(r'"([^"\n]*?)\?,', r'"\1",', line2)
    # "....?: -> "....":
    line2 = re.sub(r'"([^"\n]*?)\?:', r'"\1":', line2)
    # title: "x""none" 
    line2 = re.sub(r'title:\s*"([^"]*)"+"none"', r'title: "\1", icon: "none"', line2)
    # m.rallying ? "召集中? : "召集"
    line2 = re.sub(r'\? "([^"]*)\? :', r'? "\1" :', line2)
    # textContent = """;
    line2 = re.sub(r'textContent = "{2,};', 'textContent = "";', line2)
    # Prefer backup if still looks broken and key matches
    if line2.count('"') % 2 == 1 or "\ufffd" in line2:
        cands = bak_map.get(ascii_key(line)) or bak_map.get(ascii_key(line2)) or []
        if cands:
            return min(cands, key=lambda x: abs(len(x) - len(line)))
    return line2


for step in range(120):
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
        # try backup by nearby keys
        cands = bak_map.get(ascii_key(old)) or []
        if cands:
            new = cands[0]
        else:
            # last resort: comment out the line if it's toast/status
            if "showToast" in old:
                new = re.sub(r"^(\s*)", r"\1// ", old)
            elif "textContent" in old:
                new = re.sub(r"^(\s*)", r"\1// ", old)
            else:
                print("FAIL", ln, old[:200])
                print(err[:400])
                break
    print(f"L{ln}: {old[:70]!r} => {new[:70]!r}")
    lines[idx] = new
    PATH.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
else:
    print("still", check()[1][:400])

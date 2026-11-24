# -*- coding: utf-8 -*-
"""Recover client.js: merge ASCII/new logic from corrupted file with Chinese from backup."""
from __future__ import annotations

import difflib
import re
from pathlib import Path

CUR = Path(r"D:\project\papa\wxnimi\js\client.js")
BAK = Path(r"D:\project\papa\wxnimi\backup\pre-lazyload-20261123-070956\js\client.js")

cur_raw = CUR.read_bytes()
cur = cur_raw.decode("utf-8", errors="replace")
bak = BAK.read_text(encoding="utf-8")

# Normalize line endings
cur_lines = cur.replace("\r\n", "\n").replace("\r", "\n").split("\n")
bak_lines = bak.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def has_cjk_or_fffd(s: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff\ufffd]", s))


def ascii_key(s: str) -> str:
    # Keep structure for matching; strip CJK/fffd/?
    t = re.sub(r"[\u4e00-\u9fff\ufffd]+", "§", s)
    t = re.sub(r"\?+", "§", t)
    return re.sub(r"\s+", " ", t).strip()


# Map backup ascii_key -> line (last wins for dupes; store list)
bak_map: dict[str, list[str]] = {}
for ln in bak_lines:
    bak_map.setdefault(ascii_key(ln), []).append(ln)

out = []
stats = {"from_bak": 0, "keep_cur": 0, "fixed_literal": 0}

for ln in cur_lines:
    if not has_cjk_or_fffd(ln) and "?" not in ln:
        out.append(ln)
        stats["keep_cur"] += 1
        continue

    key = ascii_key(ln)
    cands = bak_map.get(key) or []
    if len(cands) == 1:
        out.append(cands[0])
        stats["from_bak"] += 1
        continue
    if cands:
        best = min(cands, key=lambda x: abs(len(x) - len(ln)))
        out.append(best)
        stats["from_bak"] += 1
        continue

    # New lines (level5 etc.): scrub fffd and broken quotes
    fixed = ln.replace("\ufffd", "")
    # Fix classic broken concat title
    if "levelRunCol" in fixed and "levelTitle" in fixed and "title:" in fixed:
        fixed = '        title: (info && info.levelTitle) || ("第" + levelRunCol + "关"),'
        stats["fixed_literal"] += 1
    elif "levelFailNode" in fixed and "title:" in fixed and "col" in fixed:
        pass
    # Odd number of quotes on toast line
    if "showToast" in fixed and fixed.count('"') % 2 == 1:
        fixed = re.sub(r'title:\s*"[^"]*', 'title: "提示"', fixed)
        if '", icon:' not in fixed and "icon:" in fixed:
            fixed = fixed.replace("icon:", '", icon:', 1)
        stats["fixed_literal"] += 1
    # textContent broken
    if "textContent" in fixed and fixed.count('"') % 2 == 1:
        fixed = re.sub(r'textContent\s*=\s*"[^"]*', 'textContent = ""', fixed)
        if not fixed.rstrip().endswith(";"):
            fixed = fixed.rstrip() + '";'
        stats["fixed_literal"] += 1
    out.append(fixed)
    stats["keep_cur"] += 1

text = "\n".join(out)
# Final sweep: remove leftover replacement chars
text = text.replace("\ufffd", "")

# Ensure critical literals exist
text = text.replace(
    'title: (info && info.levelTitle) || (" + levelRunCol + "),',
    'title: (info && info.levelTitle) || ("第" + levelRunCol + "关"),',
)
text = re.sub(
    r'title:\s*\(info\s*&&\s*info\.levelTitle\)\s*\|\|\s*\(""\s*\+\s*levelRunCol\s*\+\s*""\)',
    'title: (info && info.levelTitle) || ("第" + levelRunCol + "关")',
    text,
)

CUR.write_text(text + "\n", encoding="utf-8", newline="\n")
print(stats)
print("fffd", text.count("\ufffd"))
print("lines", len(out))

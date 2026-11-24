# -*- coding: utf-8 -*-
"""Repair client.js corrupted by PowerShell Set-Content (UTF-8 trailing bytes -> ?)."""
from __future__ import annotations

import re
from pathlib import Path

CUR = Path(r"D:\project\papa\wxnimi\js\client.js")
BAK = Path(r"D:\project\papa\wxnimi\backup\pre-lazyload-20261123-070956\js\client.js")
OUT = CUR

raw = CUR.read_bytes()
text = raw.decode("utf-8", errors="replace")
bak = BAK.read_text(encoding="utf-8")

# 1) Prefer backup line when current line has replacement chars and ASCII skeleton matches.
def skeleton(s: str) -> str:
    s = re.sub(r"[\u4e00-\u9fff\ufffd?]+", "#", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

bak_by_skel: dict[str, list[str]] = {}
for line in bak.splitlines():
    sk = skeleton(line)
    if "#" in sk:
        bak_by_skel.setdefault(sk, []).append(line)

fixed_lines = []
replaced = 0
for line in text.splitlines():
    if "\ufffd" in line or (b"?" in line.encode("utf-8", errors="ignore") and re.search(r"[\x80-\xff]\?", line.encode("latin1", errors="ignore").decode("latin1", errors="ignore") if False else "")):
        pass
    if "\ufffd" in line:
        sk = skeleton(line)
        cands = bak_by_skel.get(sk) or []
        # also try without trailing commas differences
        if not cands:
            for k, v in bak_by_skel.items():
                if k.replace(" ", "") == sk.replace(" ", ""):
                    cands = v
                    break
        if len(cands) == 1:
            fixed_lines.append(cands[0])
            replaced += 1
            continue
        if cands:
            # pick closest length
            best = min(cands, key=lambda x: abs(len(x) - len(line)))
            fixed_lines.append(best)
            replaced += 1
            continue
    fixed_lines.append(line)

text2 = "\n".join(fixed_lines) + "\n"

# 2) Known literal repairs for level / remaining broken strings
repairs = [
    (r'\("\ufffd\? \+ levelRunCol \+ "\ufffd\?\)', '("第" + levelRunCol + "关")'),
    (r'\("\ufffd\? \+ levelRunCol \+ "\ufffd\?\)', '("第" + levelRunCol + "关")'),
    (r'"可以自由练习\ufffd\?"', '"可以自由练习"'),
    (r'"可以自由练习\?"', '"可以自由练习"'),
]

# Broader: fix `"....�?`  -> truncate at replacement and close quote if clearly toast titles
def fix_broken_quotes(s: str) -> str:
    # Pattern: "....�?  where ? may be literal question or leftover
    def repl(m: re.Match) -> str:
        body = m.group(1)
        # drop trailing junk
        body = re.sub(r"[\ufffd?]+$", "", body)
        return '"' + body + '"'

    s = re.sub(r'"([^"\n]*?)\ufffd\?"', repl, s)
    s = re.sub(r'"([^"\n]*?)\ufffd"', repl, s)
    return s

text2 = fix_broken_quotes(text2)

# Specific common titles from game
manual = {
    'title: (info && info.levelTitle) || ("\ufffd? + levelRunCol + "\ufffd?),':
        'title: (info && info.levelTitle) || ("第" + levelRunCol + "关"),',
}
for a, b in manual.items():
    if a in text2:
        text2 = text2.replace(a, b)

# Fix remaining unclosed string: look for showToast title broken
text2 = re.sub(
    r'wx\.showToast\(\{\s*title:\s*"[^"\n]*?\ufffd[^"\n]*?,\s*icon:',
    lambda m: re.sub(r'title:\s*"[^"]*', 'title: "提示"', m.group(0)).replace('icon:', '", icon:'),
    text2,
)

# More direct pass for toast lines still broken
out_lines = []
for line in text2.splitlines():
    if "showToast" in line and line.count('"') % 2 == 1:
        # odd quotes — broken
        line = re.sub(
            r'title:\s*"[^"]*$',
            'title: "提示", icon: "none", duration: 1400 }); } catch (e) {}',
            line,
        )
        # if duplicated trailing, trim crudely
        if line.count("catch") > 1:
            line = re.sub(r'\}\s*catch.*$', '} catch (e) {}', line)
    # levelFailNode title
    if "levelTitle" in line and "levelRunCol" in line and "\ufffd" in line:
        line = '        title: (info && info.levelTitle) || ("第" + levelRunCol + "关"),'
    if "node.title" in line and "第" not in line and "levelFailNode" in "".join(out_lines[-5:]):
        pass
    out_lines.append(line)

text2 = "\n".join(out_lines) + "\n"

# 3) Replace remaining replacement chars inside comments with empty / tilde so file is valid utf-8 source
# Keep ASCII code intact
def scrub_fffd_in_comments_and_strings(s: str) -> str:
    # In comments // ...
    def fix_line(line: str) -> str:
        if "\ufffd" not in line:
            return line
        # full-line comment
        if re.match(r"^\s*//", line):
            return re.sub(r"\ufffd\??", "", line)
        # block keep code, strip fffd in comment tail
        if "//" in line:
            code, _, cmt = line.partition("//")
            cmt = re.sub(r"\ufffd\??", "", cmt)
            return code + "//" + cmt
        # string with fffd: remove fffd chars inside strings
        def fix_str(m: re.Match) -> str:
            inner = m.group(1).replace("\ufffd", "").replace("??", "")
            return '"' + inner + '"'
        line2 = re.sub(r'"([^"\\]*(?:\\.[^"\\]*)*)"', fix_str, line)
        # if still odd quotes, nuke fffd
        line2 = line2.replace("\ufffd", "")
        return line2

    return "\n".join(fix_line(L) for L in s.splitlines()) + "\n"

text2 = scrub_fffd_in_comments_and_strings(text2)

OUT.write_text(text2, encoding="utf-8", newline="\n")
print("replaced_from_backup", replaced)
print("fffd_left", text2.count("\ufffd"))
print("wrote", OUT)

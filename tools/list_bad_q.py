# -*- coding: utf-8 -*-
import re
p = r"D:\project\papa\wxnimi\js\client.js"
lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
bad = []
for i, l in enumerate(lines, 1):
    if "?" not in l:
        continue
    if re.search(r"[\u4e00-\u9fff]\?", l) or re.search(r'"[^"]*\?\s*[;}:,)]', l) or re.search(r'"\?\s*[;}]', l) or re.search(r"`[^`]*\?[^`]*`", l):
        # skip ternary / optional chaining noise somewhat
        if '?.' in l and l.count('?') == 1:
            continue
        bad.append((i, l[:140]))
print("bad count", len(bad))
for i, l in bad[:60]:
    print(f"{i}: {l}")

from pathlib import Path
import re

replacements = [
    # AgentCommandCenter
    ("  \u2699\ufe0f", ""),  # ⚙️ line 117 just emoji alone -> remove or replace with Settings icon handled manually
]

# Do targeted file-by-file

# 1. AgentCommandCenter.tsx
for base in ["desktop/src/components/AgentCommandCenter.tsx", r"C:\Users\lucas\OneDrive\Documentos\assistente\.worktrees\charlie-dev\desktop\src\components\AgentCommandCenter.tsx"]:
    t = Path(base).read_text(encoding="utf-8")
    orig = t
    t = t.replace("\u2699\ufe0f", "")
    t = t.replace('\uD83D\uDD0D', "")  # 🔍 need handle surrogate
    # Actually read as python string: simpler replace chars
    if t != orig:
        Path(base).write_text(t, encoding="utf-8")
        print(f"patched {base}")

# More robust: direct string replace with bytes

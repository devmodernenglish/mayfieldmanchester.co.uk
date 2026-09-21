#!/usr/bin/env bash
# Builds dist from src/.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist && mkdir -p dist

# Copy HTML, CSS, JS, and non-image assets from src/ to dist/.
# NB: use cp, not rsync — the Cloudflare Pages build image has no rsync, so the
# old `rsync ... || true` silently dropped every non-img asset (fonts, logos,
# republic/, videos/, …) from the deploy while masking the failure.
cp ./src/*.html dist/ 2>/dev/null || true
cp -R src/css src/js dist/ 2>/dev/null || true
cp src/favicon.ico dist/ 2>/dev/null || true   # browsers ask for /favicon.ico unprompted
mkdir -p dist/assets
# Everything under src/assets EXCEPT img/ (Pillow regenerates img/ as jpg below).
find src/assets -mindepth 1 -maxdepth 1 ! -name img -exec cp -R {} dist/assets/ \;
find dist/assets -name '.DS_Store' -delete
mkdir -p dist/assets/img

# Images already optimised in src/ (the home plates are authored as jpg now)
# are copied straight through. The Pillow pass below only regenerates the PNG
# sources, so without this they were excluded from the deploy entirely — img/
# is skipped by the copy above on the assumption that everything in it is a
# PNG waiting to be converted.
cp src/assets/img/*.jpg dist/assets/img/ 2>/dev/null || true

# ---- Imagery ---------------------------------------------------------------
python3 - <<'PY'
from PIL import Image
import os, glob

# Source pattern in src/, destination path maps to dist/
JOBS = [("src/assets/img/insta-*.png", 560, 82),
        ("src/assets/img/home-*.png", 1800, 84)]

for pattern, cap, q in JOBS:
    for src in sorted(glob.glob(pattern)):
        im = Image.open(src)
        im = im.convert("RGB")
        w, h = im.size
        if max(w, h) > cap:
            s = cap / max(w, h)
            im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)

        # Replace 'src/' prefix with 'dist/' in output path
        rel_path = os.path.relpath(src, "src")
        dst = os.path.join("dist", os.path.splitext(rel_path)[0] + ".jpg")

        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.save(dst, "JPEG", quality=q, optimize=True, progressive=True)
        print(f"  {os.path.basename(src):24} {os.path.getsize(src)//1024:>6}KB -> "
              f"{os.path.getsize(dst)//1024:>5}KB  {im.size[0]}x{im.size[1]}")
PY

# Rewrite .png references to .jpg in compiled dist/*.html
python3 - <<'PY'
import glob, re
for p in glob.glob('dist/*.html'):
    with open(p, 'r') as f:
        s = f.read()
    s = re.sub(r'((?:/|\./)?assets/img/(?:insta|home)-\d+)\.png', r'\1.jpg', s)
    with open(p, 'w') as f:
        f.write(s)
PY

find dist -name '.DS_Store' -delete
echo "built dist — $(du -sh dist | cut -f1), $(find dist -type f | wc -l | tr -d ' ') files"

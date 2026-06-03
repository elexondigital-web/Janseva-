#!/usr/bin/env bash
# Convert janseva_user_manual.md → janseva_user_manual.pdf.
#
# Tries pandoc first (best output, supports the YAML front-matter
# title block); falls back to `npx md-to-pdf` (no install needed if
# Node is around). Either tool produces an A4 PDF with a sensible
# default font.
set -euo pipefail

cd "$(dirname "$0")"
SRC="janseva_user_manual.md"
OUT="janseva_user_manual.pdf"

if command -v pandoc >/dev/null 2>&1; then
  echo "==> Using pandoc"
  pandoc "$SRC" \
    --pdf-engine=xelatex \
    --variable=geometry:a4paper,margin=20mm \
    --variable=mainfont:'DejaVu Sans' \
    --variable=monofont:'DejaVu Sans Mono' \
    --variable=colorlinks=true \
    --variable=linkcolor=blue \
    --toc \
    --toc-depth=2 \
    -o "$OUT"
elif command -v npx >/dev/null 2>&1; then
  echo "==> Using npx md-to-pdf (no global install needed)"
  npx --yes md-to-pdf "$SRC" --pdf-options '{"format":"A4","margin":"20mm"}'
else
  echo "ERROR: neither pandoc nor npx is available."
  echo "Install pandoc:  https://pandoc.org/installing.html"
  echo "Or install Node: https://nodejs.org"
  exit 1
fi

echo "Manual built: $(realpath "$OUT")"

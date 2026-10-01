#!/usr/bin/env bash
# Commit + push Sempoa Mahjong ke GitHub dengan identitas PRIBADI, lalu aktifkan GitHub Pages.
#
# Pakai (sekali, dari folder repo):
#   gh auth login -h github.com -p https -w          # login dengan akun GitHub pribadi
#   tools/publish.sh "Nama Kamu" "email@pribadi.com"
#
# Selanjutnya cukup:  tools/publish.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="andrewjevon2000/mahjongsmartdetector"
NAME="${1:-}"; EMAIL="${2:-}"

if [[ -n "$NAME" && -n "$EMAIL" ]]; then
  git config --local user.name "$NAME"
  git config --local user.email "$EMAIL"
fi
EMAIL_NOW="$(git config --local user.email || true)"
if [[ -z "$EMAIL_NOW" ]]; then
  echo "Identitas belum diatur. Jalankan: tools/publish.sh \"Nama\" \"email@pribadi.com\"" >&2; exit 1
fi
if [[ "$EMAIL_NOW" == *"@yobo.id" ]]; then
  echo "Email kantor tidak dipakai untuk repo ini. Pakai email pribadi." >&2; exit 1
fi
gh auth status >/dev/null 2>&1 || { echo "Belum login GitHub. Jalankan: gh auth login -h github.com -p https -w" >&2; exit 1; }

python3 build.py
node test/engine.test.js | tail -1

git add -A
if git diff --cached --quiet; then
  echo "Tidak ada perubahan untuk di-commit."
else
  MSG="${3:-Update Sempoa Mahjong}"
  git commit -q -m "$MSG" && echo "Commit sebagai $(git config --local user.name) <$EMAIL_NOW>"
fi
git branch -M main
git push -u origin main

# GitHub Pages dari branch main, folder root (aman diulang)
if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$REPO/pages" --input - <<<'{"source":{"branch":"main","path":"/"}}' >/dev/null
  echo "GitHub Pages diaktifkan."
fi
echo
echo "Buka di HP (tunggu 1-2 menit setelah push pertama):"
echo "  https://andrewjevon2000.github.io/mahjongsmartdetector/"

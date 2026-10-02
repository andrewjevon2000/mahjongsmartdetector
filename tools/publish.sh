#!/usr/bin/env bash
# Commit + push Sempoa Mahjong to GitHub with a PERSONAL identity, then enable GitHub Pages.
#
# Usage (once, from the repo folder):
#   gh auth login -h github.com -p https -w          # log in with your personal GitHub account
#   tools/publish.sh "Your Name" "you@personal.com"
#
# Afterwards just:  tools/publish.sh
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
  echo "Identity not set. Run: tools/publish.sh \"Name\" \"you@personal.com\"" >&2; exit 1
fi
if [[ "$EMAIL_NOW" == *"@yobo.id" ]]; then
  echo "The work email is not used for this repo. Use a personal email." >&2; exit 1
fi
gh auth status >/dev/null 2>&1 || { echo "Not logged in to GitHub. Run: gh auth login -h github.com -p https -w" >&2; exit 1; }

python3 build.py
node test/engine.test.js | tail -1

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  MSG="${3:-Update Sempoa Mahjong}"
  git commit -q -m "$MSG" && echo "Committed as $(git config --local user.name) <$EMAIL_NOW>"
fi
git branch -M main
git push -u origin main

# GitHub Pages from branch main, root folder (safe to repeat)
if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$REPO/pages" --input - <<<'{"source":{"branch":"main","path":"/"}}' >/dev/null
  echo "GitHub Pages enabled."
fi
echo
echo "Open on your phone (allow 1-2 minutes after the first push):"
echo "  https://andrewjevon2000.github.io/mahjongsmartdetector/"

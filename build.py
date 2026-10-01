"""Rakit Sempoa Mahjong jadi satu file.

- index.html                   : dokumen lengkap untuk GitHub Pages (kamera live aktif di sini)
- publish/sempoa-mahjong.html  : isi halaman saja, untuk Artifact di claude.ai (baca foto lewat Claude)
"""
from pathlib import Path
from urllib.parse import quote

root = Path(__file__).parent
engine = (root / "src/engine.js").read_text()
app = (root / "src/app.js").read_text()
live = (root / "src/live.js").read_text()
page = (root / "src/app.html").read_text()

glyphs = quote("萬東南西北白發中一二三四五六七八九")
content = (
    page.replace("%%GLYPHS%%", glyphs)
    .replace("%%ENGINE%%", engine)
    .replace("%%APP%%", app)
    .replace("%%LIVE%%", live)
)

(root / "publish").mkdir(exist_ok=True)
(root / "publish/sempoa-mahjong.html").write_text(content)

full = (
    '<!doctype html>\n<html lang="id">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<meta name="theme-color" content="#133629">\n'
    "</head>\n<body>\n" + content + "\n</body>\n</html>\n"
)
(root / "index.html").write_text(full)
print("ok", len(full) // 1024, "KB")

# Sempoa Mahjong · Smart Detector

Asisten mahjong Hong Kong (Majé House Rules) untuk HP. Berjalan sepenuhnya di browser:

- **Kamera live** — model pengenal tile (YOLO11n, ONNX) jalan langsung di HP lewat onnxruntime-web; tangan dan buangan tercatat otomatis.
- **Saran buang** menuju menang sah (minimal 3 poin), poin tiap pola, saran klaim Pong/Chi/Kong/Hu.
- **Baca lawan** — perkiraan lawan sudah siap, tebakan pola (Half/Full Flush, Dragon, Wind, All Pongs), risiko kena Hu per tile, mode Serang / Hati-hati / Bertahan.

Buka: `https://andrewjevon2000.github.io/mahjongsmartdetector/`

## Struktur

| Path | Isi |
|---|---|
| `index.html` | Aplikasi jadi (dibuat oleh `build.py`) |
| `src/engine.js` | Mesin hitung: shanten, jalur pola, poin Majé, simulasi, baca lawan |
| `src/app.js`, `src/app.html` | Tampilan |
| `src/live.js` | Kamera live + deteksi tile |
| `model/` | `mahjong.onnx` + `meta.json` (hasil `tools/train.py`) |
| `test/engine.test.js` | Tes mesin (`node test/engine.test.js`) |

## Model saat ini

YOLO11n, 512 px, 30 epoch di Apple M1 (dataset v83: 6.294 latih / 788 validasi / 568 uji).

| | mAP50 | mAP50-95 |
|---|---|---|
| Validasi | 87,0% | 66,4% |
| Uji | 84,4% | 65,3% |

Tile biasa (Characters/Dots/Bamboo/Winds/Dragons) umumnya 80–97%. Yang paling lemah adalah
Flower/Season (39–70%) dan 9 Characters (74%). Kalau tile di mejamu sering salah baca, kumpulkan
foto lewat tombol **Simpan foto latihan**, labeli, gabungkan ke dataset, lalu latih ulang.

## Melatih ulang model

```bash
python3 tools/train.py ~/Downloads/<dataset-roboflow-yolo>.zip 30 512
python3 build.py
```

## Atribusi

Model dilatih dari dataset **"Mahjong" oleh Jon Chan**, Roboflow Universe, lisensi
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) —
https://universe.roboflow.com/jon-chan-gnsoa/mahjong-baq4s

Tabel poin mengikuti Majé House Rules (Hong Kong Mahjong Rules).

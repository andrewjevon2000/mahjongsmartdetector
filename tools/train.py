"""Latih model pengenal tile untuk Kamera live Sempoa Mahjong.

Pakai:
    python3 tools/train.py ~/Downloads/<dataset-roboflow-yolo>.zip [epochs]

Hasil:
    model/mahjong.onnx  + model/meta.json   (dibaca oleh index.html)

Dataset bawaan: "Mahjong" oleh Jon Chan, Roboflow Universe, CC BY 4.0
https://universe.roboflow.com/jon-chan-gnsoa/mahjong-baq4s
"""
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

import yaml
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
WINDS_DRAGONS = {"EW": "1z", "SW": "2z", "WW": "3z", "NW": "4z", "WD": "5z", "GD": "6z", "RD": "7z"}


def tile_code(name: str):
    """Nama kelas dataset -> kode tile Sempoa (1m..9m, 1p.., 1s.., 1z..7z, f1..f8)."""
    n = str(name).strip().upper()
    m = re.fullmatch(r"([1-9])([BCDFS])", n)
    if m:
        d, s = m.groups()
        return {"B": d + "s", "C": d + "m", "D": d + "p", "F": "f" + d, "S": "f" + str(int(d) + 4)}[s]
    return WINDS_DRAGONS.get(n)


def prepare(zip_path: Path) -> tuple[Path, list[str]]:
    data_dir = ROOT / "datasets" / "maje"
    if data_dir.exists():
        shutil.rmtree(data_dir)
    data_dir.mkdir(parents=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(data_dir)
    yml = next(data_dir.rglob("data.yaml"))
    base = yml.parent
    cfg = yaml.safe_load(yml.read_text())
    for key, folder in (("train", "train"), ("val", "valid"), ("test", "test")):
        p = base / folder / "images"
        if not p.exists() and folder == "valid":
            p = base / "val" / "images"
        if p.exists():
            cfg[key] = str(p)
    names = cfg["names"]
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]
    unknown = [n for n in names if not tile_code(n)]
    if unknown:
        print("Peringatan: kelas tanpa padanan tile, akan diabaikan di aplikasi:", unknown)
    fixed = base / "data.local.yaml"
    fixed.write_text(yaml.safe_dump(cfg, allow_unicode=True))
    return fixed, list(names)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    zip_path = Path(sys.argv[1]).expanduser()
    epochs = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    data_yaml, names = prepare(zip_path)
    print(f"Dataset siap: {len(names)} kelas -> {data_yaml}")

    model = YOLO("yolo11n.pt")
    model.train(
        data=str(data_yaml), imgsz=640, epochs=epochs, batch=16, device="mps",
        patience=15, project=str(ROOT / "runs"), name="maje", exist_ok=True,
        workers=4, plots=False, verbose=False,
    )
    best = ROOT / "runs" / "maje" / "weights" / "best.pt"
    metrics = YOLO(str(best)).val(data=str(data_yaml), imgsz=640, device="mps", plots=False, verbose=False)
    onnx_path = YOLO(str(best)).export(format="onnx", imgsz=640, opset=17, simplify=True, dynamic=False)

    out_dir = ROOT / "model"
    out_dir.mkdir(exist_ok=True)
    shutil.copy(onnx_path, out_dir / "mahjong.onnx")
    meta = {
        "imgsz": 640,
        "model": "model/mahjong.onnx",
        "classes": names,
        "map": {n: tile_code(n) for n in names if tile_code(n)},
        "metrics": {"mAP50": round(float(metrics.box.map50), 4), "mAP50_95": round(float(metrics.box.map), 4)},
        "source": "Mahjong dataset by Jon Chan, Roboflow Universe (CC BY 4.0) https://universe.roboflow.com/jon-chan-gnsoa/mahjong-baq4s",
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    size_mb = (out_dir / "mahjong.onnx").stat().st_size / 1e6
    print(f"Selesai. mAP50={meta['metrics']['mAP50']}  mAP50-95={meta['metrics']['mAP50_95']}  model={size_mb:.1f} MB")


if __name__ == "__main__":
    main()

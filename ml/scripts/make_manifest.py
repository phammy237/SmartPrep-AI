"""Thin CLI wrapper to (re)build the train/val/test manifest from a raw image
directory, independent of running training. Useful for inspecting the split
(e.g. counting rows per class/split) before committing to a training run.

Usage (from the ml/ directory):
    python scripts/make_manifest.py --config configs/v0_baseline.yaml
    python scripts/make_manifest.py --config configs/v0_baseline.yaml --force
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `import src...` works run from anywhere

from src.datasets.manifest import build_or_load_manifest  # noqa: E402
from src.training.config import load_config  # noqa: E402
from src.utils.classes import load_class_map  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Build (or load) the dataset manifest for a training config.")
    parser.add_argument("--config", required=True)
    parser.add_argument("--force", action="store_true", help="Rebuild even if a manifest already exists.")
    args = parser.parse_args()

    cfg = load_config(args.config)
    class_map = load_class_map(cfg.classes_path)
    rows = build_or_load_manifest(
        data_dir=cfg.data_dir,
        class_map=class_map,
        manifest_path=cfg.manifest_path,
        split=cfg.split,
        seed=cfg.seed,
        force=args.force,
    )

    print(f"Manifest: {cfg.manifest_path} ({len(rows)} rows)")
    by_split = Counter(r.split for r in rows)
    for split_name in ("train", "val", "test"):
        print(f"  {split_name}: {by_split.get(split_name, 0)}")
    by_class_split = Counter((r.label, r.split) for r in rows)
    print("Per class:")
    for label in class_map:
        counts = ", ".join(f"{s}={by_class_split.get((label, s), 0)}" for s in ("train", "val", "test"))
        print(f"  {label}: {counts}")


if __name__ == "__main__":
    main()

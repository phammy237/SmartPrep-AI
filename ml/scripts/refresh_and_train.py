"""Refresh the acquired data, pick every class that has enough of it, train, evaluate.

This is the repeatable "get the latest data and retrain" entry point:

    python scripts/refresh_and_train.py --acquire           # pull data first
    python scripts/refresh_and_train.py                      # just retrain on what's on disk

Steps:
  1. (--acquire) run `scripts/acquire/open_images.py --extended` to (re)pull
     the Open Images classes. It is idempotent: files already on disk are kept.
  2. Read every `data/provenance/*.csv` and count images + distinct groups per
     class. A class is TRAINABLE only if it has >= --min-images images and
     >= --min-groups groups, so a class with a handful of photos (or one
     photographer's burst) never becomes a trained output - it is reported as
     skipped instead of silently producing a meaningless row of the confusion
     matrix.
  3. Write the trainable classes' candidates to a combined CSV outside
     `data/provenance/` (so `audit_dataset.py`'s auto-discovery is unaffected),
     a class map, and a TrainingConfig; build a NEW manifest for this run
     (new data means a new, group-aware split - old manifests are never edited).
  4. Train, evaluate on the held-out test split, and append one line to
     `outputs/run_log.csv` so successive runs can be compared.

Honest limits: Open Images V7 is a fixed 2022 dataset, so re-running the
acquisition does not find "newer" public images - new data only arrives when
you add first-party photos (`scripts/import_first_party.py`) or another source
script. And these are Flickr photos, not fridge/pantry shots: treat the test
numbers as in-domain-for-Flickr, not as app accuracy.
"""

from __future__ import annotations

import argparse
import csv
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

_ML_ROOT = Path(__file__).resolve().parents[1]
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from src.datasets.manifest import CandidateImage, read_candidates_csv, write_candidates_csv  # noqa: E402
from src.training.config import config_from_dict  # noqa: E402
from src.utils.io import save_json  # noqa: E402

PROVENANCE_DIR = _ML_ROOT / "data" / "provenance"


def select_trainable_labels(
    candidates: list[CandidateImage], min_images: int, min_groups: int
) -> tuple[list[str], dict[str, tuple[int, int]]]:
    """(sorted trainable labels, {label: (images, groups)} for every label seen)."""
    images: dict[str, int] = defaultdict(int)
    groups: dict[str, set[str]] = defaultdict(set)
    for c in candidates:
        images[c.label] += 1
        groups[c.label].add(c.group)
    stats = {label: (images[label], len(groups[label])) for label in images}
    trainable = sorted(l for l, (n, g) in stats.items() if n >= min_images and g >= min_groups)
    return trainable, stats


def cap_per_group(candidates: list[CandidateImage], max_per_group: int, seed: int = 42) -> list[CandidateImage]:
    """Keep at most `max_per_group` images from any one (label, group).

    Group-aware splitting puts a whole group in one split, so a single huge
    group (e.g. 90 shots of three pear varieties in one store) can swing a
    class's test score on its own and make the metric about that group rather
    than the class. Capping keeps every group's influence comparable.
    Deterministic for a given seed; the kept images are a seeded random sample
    of each oversized group, returned in the input's original order."""
    import random

    by_key: dict[tuple[str, str], list[int]] = defaultdict(list)
    for i, c in enumerate(candidates):
        by_key[(c.label, c.group)].append(i)
    rng = random.Random(seed)
    keep: set[int] = set()
    for key in sorted(by_key):
        idxs = by_key[key]
        keep.update(idxs if len(idxs) <= max_per_group else rng.sample(idxs, max_per_group))
    return [c for i, c in enumerate(candidates) if i in keep]


def load_all_candidates(provenance_dir: Path) -> list[CandidateImage]:
    candidates: list[CandidateImage] = []
    for csv_path in sorted(provenance_dir.glob("*.csv")):
        candidates.extend(read_candidates_csv(csv_path))
    return candidates


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--acquire", action="store_true", help="Re-run the Open Images acquisition first.")
    parser.add_argument("--per-class", type=int, default=200)
    parser.add_argument("--min-images", type=int, default=60)
    parser.add_argument("--min-groups", type=int, default=15)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--backbone", default="resnet18")
    parser.add_argument("--no-pretrained", action="store_true", help="Train from random init (usually much worse).")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--dry-run", action="store_true", help="Print the trainable classes and stop.")
    parser.add_argument("--run-tag", default="", help="Suffix for the run folder name, e.g. 'scratch'.")
    parser.add_argument("--max-per-group", type=int, default=15, help="Cap images per (class, group) before splitting; 0 = no cap.")
    parser.add_argument("--batch-size", type=int, default=32, help="Lower this if the machine runs short of RAM.")
    args = parser.parse_args()

    if args.acquire:
        subprocess.run(
            [sys.executable, str(_ML_ROOT / "scripts" / "acquire" / "open_images.py"), "--extended", "--per-class", str(args.per_class)],
            check=True,
        )

    candidates = load_all_candidates(PROVENANCE_DIR)
    if args.max_per_group:
        before = len(candidates)
        candidates = cap_per_group(candidates, args.max_per_group)
        print(f"Capped at {args.max_per_group} images per group: {before} -> {len(candidates)} images.")
    trainable, stats = select_trainable_labels(candidates, args.min_images, args.min_groups)
    print(f"{len(candidates)} candidate images across {len(stats)} classes; {len(trainable)} trainable.")
    skipped = {l: s for l, s in stats.items() if l not in trainable}
    for label, (n, g) in sorted(skipped.items()):
        print(f"  [skip] {label}: {n} images / {g} groups (< {args.min_images} images or < {args.min_groups} groups)")
    if args.dry_run:
        print(f"\nTrainable ({len(trainable)}): " + ", ".join(f"{l}={stats[l][0]}/{stats[l][1]}g" for l in trainable))
        return
    if len(trainable) < 2:
        sys.exit("Need at least 2 trainable classes.")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    auto_dir = _ML_ROOT / "data" / "provenance_auto"
    combined_csv = auto_dir / f"combined_{stamp}.csv"
    write_candidates_csv([c for c in candidates if c.label in set(trainable)], combined_csv)

    classes_path = _ML_ROOT / "configs" / f"classes_auto_{stamp}.json"
    save_json({"version": f"auto-{stamp}", "classes": trainable}, classes_path)

    cfg = config_from_dict(
        {
            "run_name": f"auto-{len(trainable)}class" + (f"-{args.run_tag}" if args.run_tag else ""),
            "classes_path": str(classes_path.relative_to(_ML_ROOT)).replace("\\", "/"),
            "acquired_provenance_paths": [str(combined_csv.relative_to(_ML_ROOT)).replace("\\", "/")],
            "manifest_path": f"data/splits/manifest_auto_{stamp}.csv",
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "backbone": args.backbone,
            "pretrained": not args.no_pretrained,
            "num_workers": 0,
            "device": args.device,
        }
    )
    cfg.validate()

    from src.evaluation.evaluate import run_evaluation
    from src.training.train import run_training

    summary = run_training(cfg)
    run_dir = Path(summary["run_dir"])
    metrics = run_evaluation(str(run_dir / "best_model.pt"), cfg.manifest_path, args.device)
    save_json(metrics, run_dir / "test_metrics.json")

    log_path = _ML_ROOT / "outputs" / "run_log.csv"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    new_file = not log_path.exists()
    with open(log_path, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["timestamp", "run_dir", "num_classes", "num_images", "best_epoch", "val_accuracy", "test_accuracy", "test_macro_f1", "num_test"])
        w.writerow([stamp, run_dir.name, len(trainable), len(candidates), summary["best_epoch"], f"{summary['best_val_accuracy']:.4f}", f"{metrics['accuracy']:.4f}", f"{metrics['macro_f1']:.4f}", metrics["num_test_examples"]])

    print(f"\n{len(trainable)} classes | val acc {summary['best_val_accuracy']:.4f} | test acc {metrics['accuracy']:.4f} | macro F1 {metrics['macro_f1']:.4f} | n_test={metrics['num_test_examples']}")
    print(f"Run dir: {run_dir}")


if __name__ == "__main__":
    main()

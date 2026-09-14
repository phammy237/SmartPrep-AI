"""One-command dataset audit: run this after acquiring public data and/or
importing first-party photos to see exactly where the dataset stands.

Usage (from the `ml/` directory):
    python scripts/audit_dataset.py

Auto-discovers every `data/provenance/*.csv` (all acquisition scripts write
there) and scans `data/raw/` for first-party photos - no need to list
sources by hand as more get acquired/imported over time. Pass
`--provenance-csv` one or more times to override auto-discovery, or
`--no-first-party` to skip the `data/raw/` scan.

Deliberately reuses the existing curation/statistics/leakage machinery
rather than re-implementing any of it - this script is a REPORT, not a new
source of truth:
  - `src.datasets.manifest` for scanning/candidate-gathering and splitting
  - `src.curation.statistics` for per-class/source counts
  - `src.curation.leakage` for the independent leakage audit

Unlike `src.datasets.manifest.build_combined_manifest_rows` (which is
correctly strict - it REFUSES to build a training manifest missing any
class), this script's whole point is reporting on an INTERIM, possibly
incomplete dataset - so a class with zero candidates from any source is
reported as a finding ("zero-data classes"), not a crash.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_ML_ROOT = Path(__file__).resolve().parent.parent
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from src.curation.leakage import audit_manifest_leakage  # noqa: E402
from src.curation.statistics import (  # noqa: E402
    build_dataset_statistics,
    imbalance_ratio,
    images_per_class,
    source_distribution_per_class,
    split_counts,
)
from src.curation.validation import validate_images  # noqa: E402
from src.datasets.manifest import (  # noqa: E402
    CandidateImage,
    assign_splits,
    candidates_from_first_party_scan,
    read_candidates_csv,
)
from src.training.config import SplitConfig  # noqa: E402
from src.utils.classes import ClassMap, load_class_map  # noqa: E402

DEFAULT_PROVENANCE_DIR = _ML_ROOT / "data" / "provenance"
DEFAULT_RAW_DIR = _ML_ROOT / "data" / "raw"
DEFAULT_CLASSES_PATH = _ML_ROOT / "configs" / "classes.json"


def discover_provenance_csvs(provenance_dir: Path) -> list[Path]:
    if not provenance_dir.is_dir():
        return []
    return sorted(provenance_dir.glob("*.csv"))


def gather_candidates(
    class_map: ClassMap,
    provenance_csvs: list[Path],
    raw_dir: Path | None,
) -> list[CandidateImage]:
    candidates: list[CandidateImage] = []
    if raw_dir is not None and raw_dir.is_dir():
        candidates.extend(candidates_from_first_party_scan(raw_dir, class_map, require_all_classes=False))
    for csv_path in provenance_csvs:
        candidates.extend(read_candidates_csv(csv_path))
    return candidates


def run_audit(
    class_map: ClassMap,
    candidates: list[CandidateImage],
    split: SplitConfig,
    seed: int,
) -> dict:
    """Everything the collection-progress report needs, computed once.
    Returns a plain dict so both `main()`'s printing and any future
    caller (e.g. a test) can consume it without re-running the audit."""
    counts = images_per_class(candidates, class_map)
    zero_data_classes = [label for label in class_map if counts.get(label, 0) == 0]
    covered_candidates = [c for c in candidates if c.label not in zero_data_classes]

    rows = assign_splits(covered_candidates, split, seed) if covered_candidates else []
    leakage_report = audit_manifest_leakage(rows) if rows else {
        "group_split_violations": {},
        "cross_split_exact_duplicates": [],
        "cross_split_near_duplicates": [],
    }

    validation_results = validate_images([c.path for c in candidates])
    stats = build_dataset_statistics(
        candidates,
        class_map,
        validation_results,
        exact_duplicate_count=0,  # not recomputed here - see leakage_report for cross-split exact dups
        near_duplicate_count=0,
        manifest_rows=rows,
    )

    per_class: dict[str, dict] = {}
    from collections import Counter

    split_by_label = Counter((r.label, r.split) for r in rows)
    groups_by_label: dict[str, set[str]] = {}
    for c in covered_candidates:
        groups_by_label.setdefault(c.label, set()).add(c.group)
    sources = source_distribution_per_class(candidates)

    for label in class_map:
        n_images = counts.get(label, 0)
        n_groups = len(groups_by_label.get(label, set()))
        split_counts_for_label = {s: split_by_label.get((label, s), 0) for s in ("train", "val", "test")}
        label_sources = sources.get(label, {})
        first_party_count = label_sources.get("first_party", 0)
        public_count = n_images - first_party_count
        fails_minimum = n_images == 0 or any(split_counts_for_label[s] == 0 for s in ("train", "val", "test"))
        per_class[label] = {
            "images": n_images,
            "groups": n_groups,
            "split_counts": split_counts_for_label,
            "sources": label_sources,
            "first_party_images": first_party_count,
            "public_images": public_count,
            "has_domain_coverage": first_party_count > 0,
            "fails_minimum": fails_minimum,
        }

    return {
        "per_class": per_class,
        "zero_data_classes": zero_data_classes,
        "total_images": len(candidates),
        "overall_split_counts": split_counts(rows) if rows else {"train": 0, "val": 0, "test": 0},
        "imbalance_ratio": imbalance_ratio(counts),
        "leakage": leakage_report,
        "dimension_summary": stats.get("dimensions", {}),
        "rejected_count": stats.get("rejected_count", 0),
        "rejected_reasons": stats.get("rejected_reasons", []),
    }


def print_report(audit: dict, class_map: ClassMap) -> None:
    print("=" * 70)
    print("SmartPrep dataset audit")
    print("=" * 70)
    print(f"\nTotal candidate images (all sources): {audit['total_images']}")
    print(f"Class imbalance ratio (max/min, non-zero classes): {audit['imbalance_ratio']}")
    if audit["rejected_count"]:
        print(f"Rejected/invalid images: {audit['rejected_count']}")
        for reason, count in audit["rejected_reasons"][:10]:
            print(f"  - {reason} (x{count})")

    print("\nPer-class:")
    print(f"{'class':<10} {'images':>7} {'groups':>7} {'train':>6} {'val':>5} {'test':>5} {'1st-party':>9} {'public':>7}  status")
    for label in class_map:
        info = audit["per_class"][label]
        sc = info["split_counts"]
        status = "OK" if not info["fails_minimum"] else ("NO DATA" if info["images"] == 0 else "FAILS MINIMUM")
        domain_flag = "" if info["has_domain_coverage"] else "  [no first-party/domain imagery]"
        print(
            f"{label:<10} {info['images']:>7} {info['groups']:>7} {sc['train']:>6} {sc['val']:>5} {sc['test']:>5} "
            f"{info['first_party_images']:>9} {info['public_images']:>7}  {status}{domain_flag}"
        )

    print(f"\nOverall split counts: {audit['overall_split_counts']}")

    print("\nLeakage audit:")
    leakage = audit["leakage"]
    print(f"  group_split_violations: {leakage['group_split_violations']}")
    print(f"  cross_split_exact_duplicates: {len(leakage['cross_split_exact_duplicates'])}")
    print(f"  cross_split_near_duplicates: {len(leakage['cross_split_near_duplicates'])}")

    print("\nZero-data classes (no image from any source):")
    print(f"  {audit['zero_data_classes'] or 'none'}")

    failing = [label for label in class_map if audit["per_class"][label]["fails_minimum"]]
    print("\nClasses failing the split/group minimum (train/val/test all non-empty):")
    print(f"  {failing or 'none'}")

    no_domain = [label for label in class_map if not audit["per_class"][label]["has_domain_coverage"]]
    print("\nClasses with zero first-party (SmartPrep-domain) imagery:")
    print(f"  {no_domain or 'none'}")

    gate_passes = (
        not audit["zero_data_classes"]
        and not failing
        and not leakage["group_split_violations"]
        and not leakage["cross_split_exact_duplicates"]
    )
    print("\n" + "=" * 70)
    print(f"QUALITY GATE: {'READY FOR TRAINING' if gate_passes else 'NOT READY FOR TRAINING'}")
    print("=" * 70)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--classes", default=str(DEFAULT_CLASSES_PATH))
    parser.add_argument("--provenance-dir", default=str(DEFAULT_PROVENANCE_DIR))
    parser.add_argument("--provenance-csv", action="append", default=None, help="Override auto-discovery; repeatable.")
    parser.add_argument("--raw-dir", default=str(DEFAULT_RAW_DIR))
    parser.add_argument("--no-first-party", action="store_true", help="Skip scanning --raw-dir.")
    parser.add_argument("--train", type=float, default=0.7)
    parser.add_argument("--val", type=float, default=0.15)
    parser.add_argument("--test", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    class_map = load_class_map(args.classes)
    provenance_csvs = (
        [Path(p) for p in args.provenance_csv] if args.provenance_csv else discover_provenance_csvs(Path(args.provenance_dir))
    )
    raw_dir = None if args.no_first_party else Path(args.raw_dir)

    candidates = gather_candidates(class_map, provenance_csvs, raw_dir)
    audit = run_audit(class_map, candidates, SplitConfig(args.train, args.val, args.test), args.seed)
    print_report(audit, class_map)


if __name__ == "__main__":
    main()

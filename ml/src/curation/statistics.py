"""Dataset statistics for the audit report: per-class counts, source mix,
image dimensions, and rejection/duplicate counts. Pure aggregation over
already-computed validation/duplicate results - no I/O of its own.
"""

from __future__ import annotations

from collections import Counter

from src.curation.validation import ImageValidationResult
from src.datasets.manifest import CandidateImage, ManifestRow
from src.utils.classes import ClassMap


def images_per_class(candidates: list[CandidateImage], class_map: ClassMap) -> dict[str, int]:
    counts = Counter(c.label for c in candidates)
    return {label: counts.get(label, 0) for label in class_map}


def source_distribution_per_class(candidates: list[CandidateImage]) -> dict[str, dict[str, int]]:
    result: dict[str, Counter] = {}
    for c in candidates:
        result.setdefault(c.label, Counter())[c.source_dataset] += 1
    return {label: dict(counter) for label, counter in result.items()}


def dimension_summary(results: list[ImageValidationResult]) -> dict:
    valid = [r for r in results if r.ok and r.width and r.height]
    if not valid:
        return {"count": 0}
    widths = [r.width for r in valid]
    heights = [r.height for r in valid]
    return {
        "count": len(valid),
        "width_min": min(widths),
        "width_max": max(widths),
        "width_mean": round(sum(widths) / len(widths), 1),
        "height_min": min(heights),
        "height_max": max(heights),
        "height_mean": round(sum(heights) / len(heights), 1),
    }


def split_counts(rows: list[ManifestRow]) -> dict[str, int]:
    counts = Counter(r.split for r in rows)
    return {split: counts.get(split, 0) for split in ("train", "val", "test")}


def imbalance_ratio(counts_per_class: dict[str, int]) -> float | None:
    """max(count) / min(count) across classes with at least one image. `None`
    if fewer than 2 non-empty classes exist (ratio is undefined/meaningless)."""
    nonzero = [c for c in counts_per_class.values() if c > 0]
    if len(nonzero) < 2:
        return None
    return round(max(nonzero) / min(nonzero), 2)


def build_dataset_statistics(
    candidates: list[CandidateImage],
    class_map: ClassMap,
    validation_results: list[ImageValidationResult],
    exact_duplicate_count: int,
    near_duplicate_count: int,
    manifest_rows: list[ManifestRow] | None = None,
) -> dict:
    per_class = images_per_class(candidates, class_map)
    rejected = [r for r in validation_results if not r.ok]
    stats = {
        "total_candidates": len(candidates),
        "images_per_class": per_class,
        "imbalance_ratio": imbalance_ratio(per_class),
        "source_distribution_per_class": source_distribution_per_class(candidates),
        "dimensions": dimension_summary(validation_results),
        "rejected_count": len(rejected),
        "rejected_reasons": Counter(r.reason for r in rejected).most_common() if rejected else [],
        "exact_duplicate_count": exact_duplicate_count,
        "near_duplicate_count": near_duplicate_count,
    }
    if manifest_rows is not None:
        stats["split_counts"] = split_counts(manifest_rows)
    return stats

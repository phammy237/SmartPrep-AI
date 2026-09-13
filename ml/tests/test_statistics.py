"""Dataset statistics aggregation - hand-computable small examples."""

from __future__ import annotations

from src.curation.statistics import (
    build_dataset_statistics,
    dimension_summary,
    imbalance_ratio,
    images_per_class,
    source_distribution_per_class,
    split_counts,
)
from src.curation.validation import ImageValidationResult
from src.datasets.manifest import CandidateImage, ManifestRow


def test_images_per_class_includes_zero_for_missing_classes(tiny_class_map):
    candidates = [
        CandidateImage(path="a", label="apple", group="a"),
        CandidateImage(path="b", label="apple", group="b"),
    ]
    counts = images_per_class(candidates, tiny_class_map)
    assert counts == {"apple": 2, "banana": 0, "carrot": 0}


def test_source_distribution_per_class_groups_by_source_dataset():
    candidates = [
        CandidateImage(path="a", label="apple", group="a", source_dataset="fruits360"),
        CandidateImage(path="b", label="apple", group="b", source_dataset="fruits360"),
        CandidateImage(path="c", label="apple", group="c", source_dataset="first_party"),
    ]
    dist = source_distribution_per_class(candidates)
    assert dist == {"apple": {"fruits360": 2, "first_party": 1}}


def test_imbalance_ratio_is_max_over_min():
    assert imbalance_ratio({"apple": 10, "banana": 5, "carrot": 20}) == 4.0


def test_imbalance_ratio_is_none_with_fewer_than_two_nonempty_classes():
    assert imbalance_ratio({"apple": 10, "banana": 0}) is None
    assert imbalance_ratio({}) is None


def test_dimension_summary_over_valid_results_only():
    results = [
        ImageValidationResult(path="a", ok=True, width=100, height=200),
        ImageValidationResult(path="b", ok=True, width=300, height=100),
        ImageValidationResult(path="c", ok=False, reason="corrupt"),
    ]
    summary = dimension_summary(results)
    assert summary["count"] == 2
    assert summary["width_min"] == 100
    assert summary["width_max"] == 300
    assert summary["height_mean"] == 150.0


def test_dimension_summary_handles_no_valid_images():
    assert dimension_summary([ImageValidationResult(path="a", ok=False, reason="corrupt")]) == {"count": 0}


def test_split_counts_covers_all_three_splits_even_if_empty():
    rows = [
        ManifestRow(path="a", label="apple", group="g1", split="train"),
        ManifestRow(path="b", label="apple", group="g2", split="train"),
    ]
    assert split_counts(rows) == {"train": 2, "val": 0, "test": 0}


def test_build_dataset_statistics_end_to_end(tiny_class_map):
    candidates = [
        CandidateImage(path="a", label="apple", group="g1", source_dataset="fruits360"),
        CandidateImage(path="b", label="banana", group="g2", source_dataset="fruits360"),
    ]
    validation_results = [
        ImageValidationResult(path="a", ok=True, width=100, height=100),
        ImageValidationResult(path="b", ok=False, reason="unreadable: bad file"),
    ]
    stats = build_dataset_statistics(
        candidates, tiny_class_map, validation_results, exact_duplicate_count=1, near_duplicate_count=2
    )
    assert stats["total_candidates"] == 2
    assert stats["images_per_class"] == {"apple": 1, "banana": 1, "carrot": 0}
    assert stats["rejected_count"] == 1
    assert stats["exact_duplicate_count"] == 1
    assert stats["near_duplicate_count"] == 2
    assert "split_counts" not in stats  # not passed manifest_rows


def test_build_dataset_statistics_includes_split_counts_when_given(tiny_class_map):
    candidates = [CandidateImage(path="a", label="apple", group="g1")]
    manifest_rows = [ManifestRow(path="a", label="apple", group="g1", split="train")]
    stats = build_dataset_statistics(candidates, tiny_class_map, [], 0, 0, manifest_rows=manifest_rows)
    assert stats["split_counts"] == {"train": 1, "val": 0, "test": 0}

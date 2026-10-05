"""Tests for the pure class-selection logic in scripts/refresh_and_train.py."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.refresh_and_train import select_trainable_labels
from src.datasets.manifest import CandidateImage


def _c(label, group, n):
    return [CandidateImage(path=f"{label}/{group}_{i}.jpg", label=label, group=group) for i in range(n)]


def test_select_trainable_labels_needs_both_enough_images_and_enough_groups():
    candidates = (
        [c for g in range(20) for c in _c("apple", f"g{g}", 5)]  # 100 images, 20 groups -> ok
        + [c for c in _c("burst", "one_photographer", 200)]  # many images, 1 group -> skip
        + [c for g in range(20) for c in _c("rare", f"r{g}", 1)]  # 20 groups, 20 images -> skip
    )
    trainable, stats = select_trainable_labels(candidates, min_images=60, min_groups=15)
    assert trainable == ["apple"]
    assert stats["burst"] == (200, 1)
    assert stats["rare"] == (20, 20)

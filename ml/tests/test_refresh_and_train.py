"""Tests for the pure class-selection logic in scripts/refresh_and_train.py."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.refresh_and_train import cap_per_group, select_trainable_labels
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


def test_cap_per_group_limits_big_groups_deterministically_and_keeps_small_ones():
    candidates = _c("pear", "big_store_group", 90) + _c("pear", "small", 3) + _c("apple", "big_store_group", 40)
    capped = cap_per_group(candidates, max_per_group=10, seed=1)
    again = cap_per_group(candidates, max_per_group=10, seed=1)
    assert [c.path for c in capped] == [c.path for c in again]  # deterministic
    counts = {}
    for c in capped:
        counts[(c.label, c.group)] = counts.get((c.label, c.group), 0) + 1
    assert counts == {("pear", "big_store_group"): 10, ("pear", "small"): 3, ("apple", "big_store_group"): 10}
    kept = {c.path for c in capped}
    assert [c.path for c in capped] == [c.path for c in candidates if c.path in kept]  # original order kept

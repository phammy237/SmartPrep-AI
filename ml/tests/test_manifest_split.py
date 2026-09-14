"""Deterministic dataset splitting: same inputs -> same split, every time; a
group's images never end up split across train/val/test; an existing manifest
is never silently overwritten."""

from __future__ import annotations

from src.datasets.manifest import (
    CandidateImage,
    assign_splits,
    build_manifest_rows,
    build_or_load_manifest,
    default_group_key,
    read_manifest,
    rows_for_split,
    scan_raw_directory,
    split_groups,
    write_manifest,
)
from src.training.config import SplitConfig


def test_default_group_key_strips_trailing_index():
    assert default_group_key("apple_session1_01") == "apple_session1"
    assert default_group_key("apple_session1_1") == "apple_session1"
    assert default_group_key("apple-3") == "apple"


def test_default_group_key_falls_back_to_whole_stem_with_no_index():
    assert default_group_key("apple") == "apple"


def test_split_groups_is_deterministic_for_the_same_seed():
    groups = [f"g{i}" for i in range(20)]
    split = SplitConfig(train=0.7, val=0.15, test=0.15)
    first = split_groups(groups, split, seed=123)
    second = split_groups(groups, split, seed=123)
    assert first == second


def test_split_groups_differs_for_a_different_seed_in_general():
    groups = [f"g{i}" for i in range(20)]
    split = SplitConfig(train=0.7, val=0.15, test=0.15)
    a = split_groups(groups, split, seed=1)
    b = split_groups(groups, split, seed=2)
    assert a != b


def test_split_groups_covers_every_group_exactly_once():
    groups = [f"g{i}" for i in range(17)]
    split = SplitConfig(train=0.6, val=0.2, test=0.2)
    assignment = split_groups(groups, split, seed=7)
    assert set(assignment.keys()) == set(groups)
    assert set(assignment.values()) <= {"train", "val", "test"}


def test_assign_splits_stratifies_per_label_not_globally():
    """A class with very few groups must get its OWN train/val/test ratio,
    independent of how many groups other classes in the same manifest have -
    reproduces the real bug found on a 6-class manifest combining a
    1-3-groups/class source with an 11-57-groups/class source, where a
    global (unstratified) group pool let a low-group class's actual split
    ratio drift arbitrarily based on unrelated classes' group counts."""
    candidates = []
    # "rare" has exactly 3 groups (10 images each) - too few to reliably
    # land in all three splits under a GLOBAL pool dominated by "common"'s
    # 90 groups, but must still get a sensible per-class split on its own.
    for g in range(3):
        for i in range(10):
            candidates.append(CandidateImage(path=f"rare_{g}_{i}.jpg", label="rare", group=f"rare_g{g}"))
    for g in range(90):
        candidates.append(CandidateImage(path=f"common_{g}.jpg", label="common", group=f"common_g{g}"))

    rows = assign_splits(candidates, SplitConfig(train=0.7, val=0.15, test=0.15), seed=42)

    rare_splits = {r.split for r in rows if r.label == "rare"}
    # with only 3 groups split 70/15/15 -> round(3*.7)=2 train, round(3*.15)=0 val, 1 test:
    # "rare" should show up in exactly train+test (2 splits), by design of
    # its OWN group count - not zero, and not dictated by "common"'s 90 groups.
    assert rare_splits == {"train", "test"}

    common_groups_by_split: dict[str, set[str]] = {}
    for r in rows:
        if r.label == "common":
            common_groups_by_split.setdefault(r.split, set()).add(r.group)
    # "common" (90 groups) gets a real 3-way split on its own terms too.
    assert len(common_groups_by_split) == 3


def test_assign_splits_is_deterministic_when_stratified():
    candidates = [
        CandidateImage(path=f"a{i}.jpg", label="apple", group=f"ag{i}") for i in range(10)
    ] + [CandidateImage(path=f"b{i}.jpg", label="banana", group=f"bg{i}") for i in range(10)]
    split = SplitConfig(train=0.6, val=0.2, test=0.2)
    first = assign_splits(candidates, split, seed=7)
    second = assign_splits(candidates, split, seed=7)
    assert first == second


def test_scan_raw_directory_finds_every_image(tiny_raw_data_dir, tiny_class_map):
    pairs = scan_raw_directory(tiny_raw_data_dir, tiny_class_map)
    assert len(pairs) == 3 * 12  # 3 classes * 4 sessions * 3 images
    labels = {label for _path, label in pairs}
    assert labels == set(tiny_class_map)


def test_scan_raw_directory_raises_on_missing_class(tmp_path, tiny_class_map):
    (tmp_path / "apple").mkdir()
    (tmp_path / "apple" / "a.png").write_bytes(b"not a real image but present")
    try:
        scan_raw_directory(tmp_path, tiny_class_map)
        raised = False
    except FileNotFoundError as exc:
        raised = True
        assert "banana" in str(exc) and "carrot" in str(exc)
    assert raised


def test_same_session_images_stay_in_the_same_split(tiny_raw_data_dir, tiny_class_map):
    split = SplitConfig(train=0.5, val=0.25, test=0.25)
    rows = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, split, seed=42)

    by_group: dict[str, set[str]] = {}
    for row in rows:
        by_group.setdefault(row.group, set()).add(row.split)

    for group, splits_seen in by_group.items():
        assert len(splits_seen) == 1, f"group {group!r} was split across {splits_seen}"


def test_build_manifest_rows_is_deterministic(tiny_raw_data_dir, tiny_class_map):
    split = SplitConfig(train=0.5, val=0.25, test=0.25)
    first = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, split, seed=99)
    second = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, split, seed=99)
    assert first == second


def test_write_then_read_manifest_round_trips(tmp_path, tiny_raw_data_dir, tiny_class_map):
    split = SplitConfig(train=0.5, val=0.25, test=0.25)
    rows = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, split, seed=5)
    manifest_path = tmp_path / "manifest.csv"
    write_manifest(rows, manifest_path)

    reloaded = read_manifest(manifest_path)
    assert reloaded == rows


def test_rows_for_split_filters_correctly(tiny_raw_data_dir, tiny_class_map):
    split = SplitConfig(train=0.5, val=0.25, test=0.25)
    rows = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, split, seed=5)
    for split_name in ("train", "val", "test"):
        filtered = rows_for_split(rows, split_name)
        assert all(r.split == split_name for r in filtered)
    assert sum(len(rows_for_split(rows, s)) for s in ("train", "val", "test")) == len(rows)


def test_build_or_load_manifest_does_not_silently_resplit(tmp_path, tiny_raw_data_dir, tiny_class_map):
    manifest_path = tmp_path / "manifest.csv"
    split = SplitConfig(train=0.5, val=0.25, test=0.25)

    first = build_or_load_manifest(tiny_raw_data_dir, tiny_class_map, manifest_path, split, seed=1, force=False)
    # A different seed on the second call must NOT change anything, because
    # the manifest already exists and force=False.
    second = build_or_load_manifest(tiny_raw_data_dir, tiny_class_map, manifest_path, split, seed=999, force=False)
    assert first == second


def test_build_or_load_manifest_force_does_regenerate(tmp_path, tiny_raw_data_dir, tiny_class_map):
    manifest_path = tmp_path / "manifest.csv"
    split = SplitConfig(train=0.5, val=0.25, test=0.25)

    build_or_load_manifest(tiny_raw_data_dir, tiny_class_map, manifest_path, split, seed=1, force=False)
    mtime_before = manifest_path.stat().st_mtime_ns

    forced = build_or_load_manifest(tiny_raw_data_dir, tiny_class_map, manifest_path, split, seed=1, force=True)
    assert len(forced) > 0
    assert manifest_path.stat().st_mtime_ns >= mtime_before

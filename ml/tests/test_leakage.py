"""Independent leakage auditing of a built manifest."""

from __future__ import annotations

from src.curation.leakage import (
    audit_manifest_leakage,
    find_cross_split_exact_duplicates,
    find_cross_split_near_duplicates,
    find_group_split_violations,
)
from src.datasets.manifest import ManifestRow


def test_a_correctly_built_manifest_has_no_group_split_violations(tiny_raw_data_dir, tiny_class_map):
    from src.datasets.manifest import build_manifest_rows
    from src.training.config import SplitConfig

    rows = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, SplitConfig(0.5, 0.25, 0.25), seed=1)
    assert find_group_split_violations(rows) == {}


def test_group_split_violation_is_detected_when_present():
    rows = [
        ManifestRow(path="a", label="apple", group="g1", split="train"),
        ManifestRow(path="b", label="apple", group="g1", split="test"),  # same group, different split!
    ]
    violations = find_group_split_violations(rows)
    assert violations == {"g1": {"train", "test"}}


def _write_bytes(path, content):
    path.write_bytes(content)
    return str(path)


def test_cross_split_exact_duplicate_is_detected(tmp_path):
    a = _write_bytes(tmp_path / "a.bin", b"identical bytes")
    b = _write_bytes(tmp_path / "b.bin", b"identical bytes")
    rows = [
        ManifestRow(path=a, label="apple", group="g1", split="train"),
        ManifestRow(path=b, label="apple", group="g2", split="test"),  # different group, same file!
    ]
    violations = find_cross_split_exact_duplicates(rows)
    assert len(violations) == 1
    assert violations[0].split_a == "train" and violations[0].split_b == "test"


def test_same_split_exact_duplicate_is_not_a_cross_split_violation(tmp_path):
    a = _write_bytes(tmp_path / "a.bin", b"identical bytes")
    b = _write_bytes(tmp_path / "b.bin", b"identical bytes")
    rows = [
        ManifestRow(path=a, label="apple", group="g1", split="train"),
        ManifestRow(path=b, label="apple", group="g2", split="train"),
    ]
    assert find_cross_split_exact_duplicates(rows) == []


def _make_image(path, color):
    from PIL import Image

    Image.new("RGB", (32, 32), color).save(path)


def test_cross_split_near_duplicate_is_detected(tmp_path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    _make_image(a, (120, 120, 120))
    _make_image(b, (122, 118, 121))  # visually near-identical
    rows = [
        ManifestRow(path=str(a), label="apple", group="g1", split="train"),
        ManifestRow(path=str(b), label="apple", group="g2", split="val"),
    ]
    violations = find_cross_split_near_duplicates(rows, max_distance=5)
    assert len(violations) == 1


def test_audit_manifest_leakage_returns_all_three_checks(tiny_raw_data_dir, tiny_class_map):
    from src.datasets.manifest import build_manifest_rows
    from src.training.config import SplitConfig

    rows = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, SplitConfig(0.5, 0.25, 0.25), seed=1)
    report = audit_manifest_leakage(rows)
    assert set(report.keys()) == {"group_split_violations", "cross_split_exact_duplicates", "cross_split_near_duplicates"}
    # The synthetic fixture's grouping is leakage-free by construction.
    assert report["group_split_violations"] == {}
    assert report["cross_split_exact_duplicates"] == []

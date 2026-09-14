"""Unit tests for scripts/audit_dataset.py - no network, tiny synthetic data.

Deliberately checks that this script REUSES existing statistics/leakage
functions rather than duplicating their logic (see its own docstring) -
these tests exercise the composition, not re-test statistics.py/leakage.py's
own behavior (already covered by their dedicated test files).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.audit_dataset import gather_candidates, run_audit
from src.datasets.manifest import CandidateImage, write_candidates_csv
from src.training.config import SplitConfig
from src.utils.classes import ClassMap


def _make_image(path, color=(100, 120, 140), size=16):
    from PIL import Image

    Image.new("RGB", (size, size), color).save(path)


def test_gather_candidates_combines_first_party_and_provenance_csvs(tiny_raw_data_dir, tmp_path, tiny_class_map):
    provenance_path = tmp_path / "acquired.csv"
    write_candidates_csv(
        [CandidateImage(path="extra.jpg", label="carrot", group="g1", source_dataset="fakevendor")],
        provenance_path,
    )
    candidates = gather_candidates(tiny_class_map, [provenance_path], tiny_raw_data_dir)
    sources = {c.source_dataset for c in candidates}
    assert "first_party" in sources
    assert "fakevendor" in sources


def test_run_audit_reports_zero_data_classes_without_crashing(tmp_path):
    class_map = ClassMap(version="test", classes=("apple", "banana", "carrot"))
    candidates = []
    for i in range(4):
        p = tmp_path / f"a{i}.jpg"
        _make_image(p)
        candidates.append(CandidateImage(path=str(p), label="apple", group=f"g{i}"))
    audit = run_audit(class_map, candidates, SplitConfig(0.5, 0.25, 0.25), seed=1)

    assert audit["zero_data_classes"] == ["banana", "carrot"]
    assert audit["per_class"]["apple"]["images"] == 4
    assert audit["per_class"]["banana"]["fails_minimum"] is True
    assert audit["per_class"]["banana"]["images"] == 0


def test_run_audit_flags_class_missing_a_split(tmp_path):
    """1 group can only ever occupy ONE split - the exact Fruits-360-carrot
    scenario from the real audit."""
    class_map = ClassMap(version="test", classes=("carrot",))
    candidates = []
    for i in range(5):
        p = tmp_path / f"c{i}.jpg"
        _make_image(p)
        candidates.append(CandidateImage(path=str(p), label="carrot", group="only_group"))
    audit = run_audit(class_map, candidates, SplitConfig(0.7, 0.15, 0.15), seed=1)

    assert audit["per_class"]["carrot"]["fails_minimum"] is True
    assert audit["per_class"]["carrot"]["groups"] == 1


def test_run_audit_passes_a_class_with_enough_groups(tmp_path):
    class_map = ClassMap(version="test", classes=("onion",))
    candidates = []
    for i in range(10):
        p = tmp_path / f"o{i}.jpg"
        _make_image(p)
        candidates.append(CandidateImage(path=str(p), label="onion", group=f"g{i}"))
    audit = run_audit(class_map, candidates, SplitConfig(0.6, 0.2, 0.2), seed=3)

    info = audit["per_class"]["onion"]
    assert info["fails_minimum"] is False
    assert all(info["split_counts"][s] > 0 for s in ("train", "val", "test"))


def test_run_audit_reports_domain_coverage_from_first_party_flag(tmp_path):
    class_map = ClassMap(version="test", classes=("egg",))
    p1 = tmp_path / "p.jpg"
    _make_image(p1)
    public_only = [CandidateImage(path=str(p1), label="egg", group="g1", source_dataset="public", first_party=False)]
    audit = run_audit(class_map, public_only, SplitConfig(0.5, 0.25, 0.25), seed=1)
    assert audit["per_class"]["egg"]["has_domain_coverage"] is False

    p2 = tmp_path / "fp.jpg"
    _make_image(p2)
    with_first_party = public_only + [
        CandidateImage(path=str(p2), label="egg", group="g2", source_dataset="first_party", first_party=True)
    ]
    audit2 = run_audit(class_map, with_first_party, SplitConfig(0.5, 0.25, 0.25), seed=1)
    assert audit2["per_class"]["egg"]["has_domain_coverage"] is True
    assert audit2["per_class"]["egg"]["first_party_images"] == 1
    assert audit2["per_class"]["egg"]["public_images"] == 1


def test_run_audit_leakage_report_is_clean_for_a_correct_manifest(tiny_raw_data_dir, tiny_class_map):
    from scripts.audit_dataset import gather_candidates

    candidates = gather_candidates(tiny_class_map, [], tiny_raw_data_dir)
    audit = run_audit(tiny_class_map, candidates, SplitConfig(0.5, 0.25, 0.25), seed=1)
    assert audit["leakage"]["group_split_violations"] == {}
    assert audit["leakage"]["cross_split_exact_duplicates"] == []

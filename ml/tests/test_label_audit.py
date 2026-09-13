"""Label auditing - flags for human review, never an automatic relabel/drop."""

from __future__ import annotations

from src.curation.label_audit import ReviewItem, build_review_queue, find_cross_label_exact_duplicates
from src.datasets.manifest import CandidateImage


def _candidate(path, label, group=None):
    return CandidateImage(path=path, label=label, group=group or path)


def test_same_file_under_two_labels_is_flagged(tmp_path):
    shared = tmp_path / "shared.bin"
    shared.write_bytes(b"identical content")
    other = tmp_path / "other.bin"
    other.write_bytes(b"identical content")  # byte-identical to `shared`

    candidates = [
        _candidate(str(shared), "apple"),
        _candidate(str(other), "banana"),  # same bytes, different label!
    ]
    items = find_cross_label_exact_duplicates(candidates)
    flagged_paths = {item.path for item in items}
    assert str(shared) in flagged_paths
    assert str(other) in flagged_paths
    assert all(item.reason == "cross_label_exact_duplicate" for item in items)


def test_duplicate_within_the_same_label_is_not_flagged(tmp_path):
    a = tmp_path / "a.bin"
    b = tmp_path / "b.bin"
    a.write_bytes(b"identical content")
    b.write_bytes(b"identical content")

    candidates = [_candidate(str(a), "apple"), _candidate(str(b), "apple")]
    assert find_cross_label_exact_duplicates(candidates) == []


def test_no_duplicates_produces_no_findings(tmp_path):
    a = tmp_path / "a.bin"
    b = tmp_path / "b.bin"
    a.write_bytes(b"one")
    b.write_bytes(b"two")

    candidates = [_candidate(str(a), "apple"), _candidate(str(b), "banana")]
    assert find_cross_label_exact_duplicates(candidates) == []


def test_build_review_queue_combines_every_finding_type():
    candidates_by_path = {
        "img1.png": CandidateImage(path="img1.png", label="apple", group="g1"),
        "img2.png": CandidateImage(path="img2.png", label="banana", group="g2"),
    }
    cross_label_items = [ReviewItem(path="x.png", label="apple", reason="cross_label_exact_duplicate", detail="d")]
    queue = build_review_queue(
        validation_reasons={"img1.png": "unreadable: bad file"},
        near_duplicate_reasons={"img2.png": "near-duplicate of img3.png (distance=2)"},
        cross_label_items=cross_label_items,
        candidates_by_path=candidates_by_path,
    )
    reasons = {item.reason for item in queue}
    assert reasons == {"cross_label_exact_duplicate", "invalid_image", "near_duplicate"}
    assert len(queue) == 3

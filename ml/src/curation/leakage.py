"""Independent leakage AUDITING of an already-built manifest - deliberately
separate from `src/datasets/manifest.py::assign_splits` (which PREVENTS
leakage by construction). This module verifies that prevention actually
worked, and catches a case `assign_splits` cannot: two DIFFERENT groups that
happen to contain byte-identical or visually-identical images (e.g. the same
public-dataset photo appearing under two different source folders/groups) -
`assign_splits` has no way to know that from group names alone.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.curation.duplicates import compute_average_hash, compute_file_hash, hamming_distance
from src.datasets.manifest import ManifestRow


def find_group_split_violations(rows: list[ManifestRow]) -> dict[str, set[str]]:
    """Returns {group: {splits it appears in}} for every group split across
    more than one train/val/test split - should always be empty for a
    manifest produced by `assign_splits`. A non-empty result here means the
    manifest file was hand-edited or came from a different process, not a
    "warning to ignore.\""""
    splits_by_group: dict[str, set[str]] = {}
    for row in rows:
        splits_by_group.setdefault(row.group, set()).add(row.split)
    return {group: splits for group, splits in splits_by_group.items() if len(splits) > 1}


@dataclass(frozen=True)
class CrossSplitDuplicate:
    path_a: str
    split_a: str
    path_b: str
    split_b: str
    distance: int  # 0 for an exact (hash) duplicate


def find_cross_split_exact_duplicates(rows: list[ManifestRow]) -> list[CrossSplitDuplicate]:
    """A row whose file can't be read (missing/moved/permission error) is
    silently skipped here, same as `find_cross_split_near_duplicates` - an
    audit should report on what it CAN verify rather than crash entirely
    over one bad path; a missing file is exactly the kind of thing
    `src/curation/validation.py` is responsible for surfacing, not this
    function."""
    by_hash: dict[str, list[ManifestRow]] = {}
    for row in rows:
        try:
            file_hash = compute_file_hash(row.path)
        except OSError:
            continue
        by_hash.setdefault(file_hash, []).append(row)

    violations: list[CrossSplitDuplicate] = []
    for same_hash_rows in by_hash.values():
        if len(same_hash_rows) < 2:
            continue
        for i in range(len(same_hash_rows)):
            for j in range(i + 1, len(same_hash_rows)):
                a, b = same_hash_rows[i], same_hash_rows[j]
                if a.split != b.split:
                    violations.append(CrossSplitDuplicate(a.path, a.split, b.path, b.split, distance=0))
    return violations


def find_cross_split_near_duplicates(rows: list[ManifestRow], max_distance: int = 5) -> list[CrossSplitDuplicate]:
    """Only compares rows sharing the same `label`. A "near duplicate"
    conceptually means the same real-world specimen photographed twice - two
    images of DIFFERENT classes can never be the same specimen, no matter
    how visually similar a coarse perceptual hash finds them (e.g. two
    photos from the same studio session/background/lighting rig, one of a
    potato and one of an onion, can collide at a low Hamming distance
    without either being mislabeled or leaked). Comparing across labels was
    tried first and produced thousands of such cross-CLASS hash collisions
    on a real multi-class photo archive that shared photography conditions
    across classes - a real finding, but about domain/background
    uniformity, not train/test leakage; see `data/DATASET_AUDIT_v0.md`."""
    hashes: dict[str, int] = {}
    for row in rows:
        try:
            hashes[row.path] = compute_average_hash(row.path)
        except Exception:
            continue

    violations: list[CrossSplitDuplicate] = []
    rows_with_hash = [r for r in rows if r.path in hashes]
    for i in range(len(rows_with_hash)):
        a = rows_with_hash[i]
        for j in range(i + 1, len(rows_with_hash)):
            b = rows_with_hash[j]
            if a.split == b.split or a.label != b.label:
                continue
            distance = hamming_distance(hashes[a.path], hashes[b.path])
            if distance <= max_distance:
                violations.append(CrossSplitDuplicate(a.path, a.split, b.path, b.split, distance=distance))
    return violations


def audit_manifest_leakage(rows: list[ManifestRow], near_duplicate_max_distance: int = 5) -> dict:
    """The one function the quality gate (see ml/README.md / dataset audit
    docs) calls: a manifest only passes if every list here is empty."""
    return {
        "group_split_violations": find_group_split_violations(rows),
        "cross_split_exact_duplicates": find_cross_split_exact_duplicates(rows),
        "cross_split_near_duplicates": find_cross_split_near_duplicates(rows, max_distance=near_duplicate_max_distance),
    }

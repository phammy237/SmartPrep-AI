"""Label auditing: flag things a human should look at. Never auto-relabels or
auto-drops anything - every finding here becomes a row in a review queue, per
"do not automatically relabel uncertain images; create a review list instead."
"""

from __future__ import annotations

from dataclasses import dataclass

from src.curation.duplicates import find_exact_duplicates
from src.datasets.manifest import CandidateImage


@dataclass(frozen=True)
class ReviewItem:
    path: str
    label: str
    reason: str
    detail: str


def find_cross_label_exact_duplicates(candidates: list[CandidateImage]) -> list[ReviewItem]:
    """The strongest possible "folder/label mismatch" signal for v0 (no
    classifier exists yet to flag "looks wrong for its label" on its own):
    the EXACT same file (byte-identical) appearing under two different
    labels. That is either a real mislabeling or a genuine cross-class
    duplicate (e.g. a picture that legitimately shows two ingredients) -
    either way, a human needs to look at it, not a heuristic."""
    by_label: dict[str, str] = {c.path: c.label for c in candidates}
    dupes = find_exact_duplicates([c.path for c in candidates])

    items: list[ReviewItem] = []
    for file_hash, paths in dupes.items():
        labels = {by_label[p] for p in paths}
        if len(labels) > 1:
            for path in paths:
                other_paths = [p for p in paths if p != path]
                items.append(
                    ReviewItem(
                        path=path,
                        label=by_label[path],
                        reason="cross_label_exact_duplicate",
                        detail=f"hash={file_hash[:12]} also labeled {sorted(labels - {by_label[path]})} at {other_paths}",
                    )
                )
    return items


def build_review_queue(
    validation_reasons: dict[str, str],
    near_duplicate_reasons: dict[str, str],
    cross_label_items: list[ReviewItem],
    candidates_by_path: dict[str, CandidateImage],
) -> list[ReviewItem]:
    """Combines every automated finding (validation failures, near-duplicate
    membership, cross-label exact duplicates) into ONE flat review list -
    never applied automatically, just surfaced for a human decision."""
    items: list[ReviewItem] = list(cross_label_items)
    for path, reason in validation_reasons.items():
        candidate = candidates_by_path.get(path)
        items.append(ReviewItem(path=path, label=candidate.label if candidate else "", reason="invalid_image", detail=reason))
    for path, reason in near_duplicate_reasons.items():
        candidate = candidates_by_path.get(path)
        items.append(ReviewItem(path=path, label=candidate.label if candidate else "", reason="near_duplicate", detail=reason))
    return items

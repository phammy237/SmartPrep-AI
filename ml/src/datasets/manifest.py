"""Deterministic, provenance-aware dataset manifest.

Two ways an image enters the manifest:
  1. First-party scan: `data_dir/<class_name>/*.jpg|png`, grouped by a
     filename-derived heuristic (`default_group_key`) - for photos SmartPrep
     itself captures.
  2. Acquired-with-provenance: an acquisition script (see `ml/scripts/acquire/`)
     downloads real, licensed third-party images and writes a provenance CSV
     recording exactly where each one came from and what GROUP it belongs to.
     The group is chosen by whoever knows the source's actual duplication
     structure (e.g. "every frame of one Fruits-360 turntable variety is one
     group") - `default_group_key`'s filename heuristic is only a fallback for
     first-party photos with no better information, not a universal rule.

Both paths converge on the same `assign_splits` - there is exactly ONE
leakage-prevention mechanism (deterministic, seeded, group-aware splitting),
not two competing ones.

Directory convention for first-party images:
`data_dir/<class_name>/*.jpg|*.jpeg|*.png` (one subdirectory per class,
matching configs/classes.json exactly).
"""

from __future__ import annotations

import csv
import random
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable

from src.training.config import SplitConfig
from src.utils.classes import ClassMap

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png")
CANDIDATE_FIELDS = (
    "path",
    "label",
    "source_label",
    "group",
    "source_dataset",
    "source_url",
    "license",
    "original_id",
    "first_party",
)
MANIFEST_FIELDS = CANDIDATE_FIELDS[:2] + ("split",) + CANDIDATE_FIELDS[2:]
SPLIT_NAMES = ("train", "val", "test")


@dataclass(frozen=True)
class CandidateImage:
    """One image, with full provenance, BEFORE a split has been assigned."""

    path: str
    label: str
    group: str
    source_dataset: str = "first_party"
    source_url: str = ""
    license: str = ""
    original_id: str = ""
    first_party: bool = True
    # The class name/category as the SOURCE dataset itself calls it - kept
    # distinct from `label` (SmartPrep's own taxonomy) whenever an
    # acquisition script maps a source category onto a different SmartPrep
    # class (e.g. BanglaVegNet's "Green Spinach" -> SmartPrep's "spinach").
    # Never silently discarded: a category rename is still fully traceable
    # back to what the original dataset called it. Empty ("") means either
    # first-party (no source taxonomy to map from) or a source whose
    # category name is already identical to `label` (e.g. Fruits-360's
    # "apple" needs no rename, though acquisition scripts are still
    # encouraged to fill this in for completeness - see fruits360.py).
    source_label: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class ManifestRow(CandidateImage):
    """A `CandidateImage` plus its assigned split - what actually gets written
    to `manifest.csv`."""

    split: str = field(default="")

    @staticmethod
    def from_candidate(candidate: CandidateImage, split: str) -> "ManifestRow":
        return ManifestRow(split=split, **candidate.to_dict())


_TRAILING_INDEX_RE = re.compile(r"[_-]?\d+$")


def default_group_key(filename_stem: str) -> str:
    """Strips a trailing `_01` / `-3` style index so consecutive shots of the
    same subject group together. Falls back to the full stem when there is no
    trailing index (each such file is then its own group). Intended for
    FIRST-PARTY filenames SmartPrep controls (e.g. `apple_session1_01.jpg`) -
    an acquired third-party source almost always needs its own grouping
    (see module docstring)."""
    stripped = _TRAILING_INDEX_RE.sub("", filename_stem)
    return stripped or filename_stem


def scan_raw_directory(data_dir: str | Path, class_map: ClassMap) -> list[tuple[Path, str]]:
    """Returns (image_path, label) pairs for every recognized image under
    `data_dir/<class_name>/`. Silently skips unknown subdirectories rather than
    erroring, so e.g. a `.DS_Store`, an `_acquired` provenance directory, or a
    not-yet-taxonomy class in progress doesn't block scanning everything else -
    but raises if a KNOWN class directory is missing or empty, since a
    silently-absent class would corrupt training without any visible signal."""
    data_dir = Path(data_dir)
    pairs: list[tuple[Path, str]] = []
    missing_or_empty: list[str] = []
    for label in class_map:
        class_dir = data_dir / label
        if not class_dir.is_dir():
            missing_or_empty.append(label)
            continue
        images = sorted(p for p in class_dir.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS)
        if not images:
            missing_or_empty.append(label)
            continue
        pairs.extend((p, label) for p in images)

    if missing_or_empty:
        raise FileNotFoundError(
            f"No images found for class(es) {missing_or_empty} under {data_dir}. "
            "Every class in configs/classes.json needs at least one image directory "
            "before a manifest can be built - see data/README.md."
        )
    return pairs


def candidates_from_first_party_scan(
    data_dir: str | Path,
    class_map: ClassMap,
    group_key_fn: Callable[[str], str] | None = None,
    require_all_classes: bool = True,
) -> list[CandidateImage]:
    """First-party candidates: scans `data_dir/<class>/`, tagging every row
    `source_dataset="first_party"`. Set `require_all_classes=False` when this
    scan is only ONE of several candidate sources being merged (e.g. some
    classes are entirely third-party-acquired and have no first-party
    subdirectory yet) - `scan_raw_directory`'s all-13-classes check is only
    appropriate when first-party photos are the SOLE source.
    """
    group_key_fn = group_key_fn or default_group_key
    if require_all_classes:
        pairs = scan_raw_directory(data_dir, class_map)
    else:
        pairs = []
        data_dir = Path(data_dir)
        for label in class_map:
            class_dir = data_dir / label
            if not class_dir.is_dir():
                continue
            pairs.extend(
                (p, label) for p in sorted(class_dir.iterdir()) if p.suffix.lower() in IMAGE_EXTENSIONS
            )
    return [
        CandidateImage(
            path=str(path),
            label=label,
            group=group_key_fn(path.stem),
            source_dataset="first_party",
            source_url="",
            license="",
            original_id=path.name,
            first_party=True,
        )
        for path, label in pairs
    ]


def write_candidates_csv(candidates: list[CandidateImage], path: str | Path) -> None:
    """Written by acquisition scripts (`ml/scripts/acquire/`) to record
    provenance for third-party images BEFORE a split is assigned."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CANDIDATE_FIELDS)
        writer.writeheader()
        for c in candidates:
            row = c.to_dict()
            row["first_party"] = str(row["first_party"])
            writer.writerow(row)


def read_candidates_csv(path: str | Path) -> list[CandidateImage]:
    with open(path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [
            CandidateImage(
                path=row["path"],
                label=row["label"],
                group=row["group"],
                source_dataset=row.get("source_dataset", "first_party"),
                source_url=row.get("source_url", ""),
                license=row.get("license", ""),
                original_id=row.get("original_id", ""),
                first_party=row.get("first_party", "True") == "True",
                source_label=row.get("source_label", ""),
            )
            for row in reader
        ]


def split_groups(groups: list[str], split: SplitConfig, seed: int) -> dict[str, str]:
    """Deterministically assigns each distinct group name to train/val/test.
    Same `groups` + `split` + `seed` always produces the same assignment -
    the split is a pure function of its inputs, never re-randomized per run."""
    unique_groups = sorted(set(groups))  # sort first so the shuffle is order-independent
    rng = random.Random(seed)
    rng.shuffle(unique_groups)

    n = len(unique_groups)
    n_train = round(n * split.train)
    n_val = round(n * split.val)
    n_train = min(n_train, n)
    n_val = min(n_val, n - n_train)

    assignment: dict[str, str] = {}
    for g in unique_groups[:n_train]:
        assignment[g] = "train"
    for g in unique_groups[n_train : n_train + n_val]:
        assignment[g] = "val"
    for g in unique_groups[n_train + n_val :]:
        assignment[g] = "test"
    return assignment


def assign_splits(candidates: list[CandidateImage], split: SplitConfig, seed: int) -> list[ManifestRow]:
    """The ONE place a split is ever assigned, regardless of where the
    candidates came from. Splits on GROUPS, never individual images - every
    candidate sharing a `group` value lands in the same split.

    Stratified PER LABEL: each class's own groups are shuffled and split
    independently at the configured train/val/test ratio, rather than
    pooling every class's groups into one shuffled list. A global pool
    lets a class's actual split ratio drift arbitrarily far from the
    configured one, purely as a side effect of which OTHER classes and how
    many of their groups happen to be in the same manifest - not something
    a per-class ratio should depend on at all. This was not a hypothetical
    concern: it showed up as a real, visible problem on a real 6-class
    manifest combining Fruits-360 (1-3 groups/class) with a second source
    (11-57 groups/class) - see `data/DATASET_AUDIT_v0.md`, "Split
    stratification fix".

    The per-label assignment is keyed by `(label, group)`, not by the bare
    group string - every current group-id producer happens to namespace its
    groups by class already (e.g. `fruits360:apple:...`, or a first-party
    scan directory that's itself per-class), but nothing enforces that, and
    a bare group string colliding across two labels would otherwise let one
    label's split assignment silently overwrite another's."""
    candidates_by_label: dict[str, list[CandidateImage]] = {}
    for c in candidates:
        candidates_by_label.setdefault(c.label, []).append(c)

    assignment: dict[tuple[str, str], str] = {}
    for label in sorted(candidates_by_label):
        groups = [c.group for c in candidates_by_label[label]]
        for group, split_name in split_groups(groups, split, seed).items():
            assignment[(label, group)] = split_name

    rows = [ManifestRow.from_candidate(c, split=assignment[(c.label, c.group)]) for c in candidates]
    # Stable, human-readable ordering in the written file - not load-bearing
    # for correctness, just for diffability.
    rows.sort(key=lambda r: (r.split, r.label, r.source_dataset, r.path))
    return rows


def build_manifest_rows(
    data_dir: str | Path,
    class_map: ClassMap,
    split: SplitConfig,
    seed: int,
    group_key_fn: Callable[[str], str] | None = None,
) -> list[ManifestRow]:
    """First-party-only convenience wrapper (all 13 classes must have a
    first-party subdirectory). For a real dataset mixing first-party and
    acquired images, use `build_combined_manifest_rows` instead."""
    candidates = candidates_from_first_party_scan(data_dir, class_map, group_key_fn=group_key_fn)
    return assign_splits(candidates, split, seed)


def build_combined_manifest_rows(
    class_map: ClassMap,
    split: SplitConfig,
    seed: int,
    data_dir: str | Path | None = None,
    acquired_provenance_paths: list[str | Path] | None = None,
    group_key_fn: Callable[[str], str] | None = None,
) -> list[ManifestRow]:
    """Merges first-party photos (if `data_dir` is given) with one or more
    acquisition provenance CSVs (if `acquired_provenance_paths` is given) into
    ONE candidate pool, then assigns splits jointly - so a group can never be
    scattered across splits just because half its images came from a
    different source than the other half (not expected in practice, but the
    architecture doesn't assume it can't happen).

    Every class in `class_map` must be covered by AT LEAST ONE of the given
    sources, combined - raises listing exactly which classes have zero
    candidates from any source, the same "fail loudly" contract as
    `scan_raw_directory`.
    """
    candidates: list[CandidateImage] = []
    if data_dir is not None:
        candidates.extend(
            candidates_from_first_party_scan(data_dir, class_map, group_key_fn=group_key_fn, require_all_classes=False)
        )
    for provenance_path in acquired_provenance_paths or []:
        candidates.extend(read_candidates_csv(provenance_path))

    covered = {c.label for c in candidates}
    missing = [label for label in class_map if label not in covered]
    if missing:
        raise FileNotFoundError(
            f"No candidate images (first-party or acquired) found for class(es) {missing}. "
            "Every class in configs/classes.json needs at least one source - see data/README.md."
        )

    return assign_splits(candidates, split, seed)


def write_manifest(rows: list[ManifestRow], path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        for row in rows:
            record = row.to_dict()
            record["first_party"] = str(record["first_party"])
            writer.writerow(record)


def read_manifest(path: str | Path) -> list[ManifestRow]:
    with open(path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [
            ManifestRow(
                path=row["path"],
                label=row["label"],
                split=row["split"],
                group=row.get("group", ""),
                source_dataset=row.get("source_dataset", "first_party"),
                source_url=row.get("source_url", ""),
                license=row.get("license", ""),
                original_id=row.get("original_id", ""),
                first_party=row.get("first_party", "True") == "True",
                source_label=row.get("source_label", ""),
            )
            for row in reader
        ]


def rows_for_split(rows: list[ManifestRow], split: str) -> list[ManifestRow]:
    if split not in SPLIT_NAMES:
        raise ValueError(f"split must be one of {SPLIT_NAMES}, got {split!r}")
    return [r for r in rows if r.split == split]


def build_or_load_manifest(
    data_dir: str | Path,
    class_map: ClassMap,
    manifest_path: str | Path,
    split: SplitConfig,
    seed: int,
    force: bool = False,
    group_key_fn: Callable[[str], str] | None = None,
) -> list[ManifestRow]:
    """First-party-only entry point (see `build_manifest_rows`). Never
    resplits a dataset silently: if `manifest_path` already exists and `force`
    is False, the EXISTING manifest is loaded and returned unchanged,
    regardless of what `split`/`seed` are set to right now."""
    manifest_path = Path(manifest_path)
    if manifest_path.exists() and not force:
        return read_manifest(manifest_path)

    rows = build_manifest_rows(data_dir, class_map, split, seed, group_key_fn=group_key_fn)
    write_manifest(rows, manifest_path)
    return rows


def build_or_load_combined_manifest(
    class_map: ClassMap,
    manifest_path: str | Path,
    split: SplitConfig,
    seed: int,
    data_dir: str | Path | None = None,
    acquired_provenance_paths: list[str | Path] | None = None,
    force: bool = False,
    group_key_fn: Callable[[str], str] | None = None,
) -> list[ManifestRow]:
    """Combined-source counterpart to `build_or_load_manifest` - same
    never-silently-resplit contract."""
    manifest_path = Path(manifest_path)
    if manifest_path.exists() and not force:
        return read_manifest(manifest_path)

    rows = build_combined_manifest_rows(
        class_map,
        split,
        seed,
        data_dir=data_dir,
        acquired_provenance_paths=acquired_provenance_paths,
        group_key_fn=group_key_fn,
    )
    write_manifest(rows, manifest_path)
    return rows

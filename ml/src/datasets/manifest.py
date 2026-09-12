"""Deterministic dataset manifest: scanning a raw image directory into
`path,label,split` rows, with reproducible grouped splitting so re-running the
same config never reshuffles the dataset.

Directory convention: `data_dir/<class_name>/*.jpg|*.jpeg|*.png` (one
subdirectory per class, matching configs/classes.json exactly).

Group-aware splitting: images whose filenames share a "session" prefix (e.g.
`fridge_session3_01.jpg`, `fridge_session3_02.jpg` from the same burst/source
sequence) are near-duplicates and must land in the SAME split, or the model
could be evaluated on a near-duplicate of a training image and look better
than it really is. `default_group_key` treats everything before the last
underscore-delimited numeric suffix as one group; pass a custom `group_key_fn`
once real captured/sourced data reveals a better grouping key (e.g. an actual
session id from filename metadata) - this is intentionally simple until real
data exists to design it against, per ml/README.md.
"""

from __future__ import annotations

import csv
import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from src.training.config import SplitConfig
from src.utils.classes import ClassMap

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png")
MANIFEST_FIELDS = ("path", "label", "split", "group")
SPLIT_NAMES = ("train", "val", "test")


@dataclass(frozen=True)
class ManifestRow:
    path: str
    label: str
    split: str
    group: str


_TRAILING_INDEX_RE = re.compile(r"[_-]?\d+$")


def default_group_key(filename_stem: str) -> str:
    """Strips a trailing `_01` / `-3` style index so consecutive shots of the
    same subject group together. Falls back to the full stem when there is no
    trailing index (each such file is then its own group)."""
    stripped = _TRAILING_INDEX_RE.sub("", filename_stem)
    return stripped or filename_stem


def scan_raw_directory(data_dir: str | Path, class_map: ClassMap) -> list[tuple[Path, str]]:
    """Returns (image_path, label) pairs for every recognized image under
    `data_dir/<class_name>/`. Silently skips unknown subdirectories rather than
    erroring, so e.g. a `.DS_Store` or a not-yet-taxonomy class in progress
    doesn't block scanning everything else - but raises if a KNOWN class
    directory is missing or empty, since a silently-absent class would corrupt
    training without any visible signal."""
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


def build_manifest_rows(
    data_dir: str | Path,
    class_map: ClassMap,
    split: SplitConfig,
    seed: int,
    group_key_fn: Callable[[str], str] | None = None,
) -> list[ManifestRow]:
    group_key_fn = group_key_fn or default_group_key
    pairs = scan_raw_directory(data_dir, class_map)

    groups = [group_key_fn(path.stem) for path, _label in pairs]
    assignment = split_groups(groups, split, seed)

    rows = [
        ManifestRow(path=str(path), label=label, split=assignment[group], group=group)
        for (path, label), group in zip(pairs, groups)
    ]
    # Stable, human-readable ordering in the written file - not load-bearing for
    # correctness (label/split come from the row itself), just for diffability.
    rows.sort(key=lambda r: (r.split, r.label, r.path))
    return rows


def write_manifest(rows: list[ManifestRow], path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({"path": row.path, "label": row.label, "split": row.split, "group": row.group})


def read_manifest(path: str | Path) -> list[ManifestRow]:
    with open(path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [
            ManifestRow(path=row["path"], label=row["label"], split=row["split"], group=row.get("group", ""))
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
    """The one entry point training/evaluation should call. Never resplits a
    dataset silently: if `manifest_path` already exists and `force` is False,
    the EXISTING manifest is loaded and returned unchanged, regardless of what
    `split`/`seed` are set to right now."""
    manifest_path = Path(manifest_path)
    if manifest_path.exists() and not force:
        return read_manifest(manifest_path)

    rows = build_manifest_rows(data_dir, class_map, split, seed, group_key_fn=group_key_fn)
    write_manifest(rows, manifest_path)
    return rows

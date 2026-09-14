"""Acquire the spinach subset from a small, official Mendeley leaf-image ZIP.

Source (verified current, official): Mendeley Data, DOI `10.17632/9c7crxrvmf.1`
  "An image dataset for classification of vegetable"
  Authors: Suzana Sowket Gohona, Afsana Mimi, Mohammad Manzurul Islam
  (East West University).
License: CC BY 4.0.

**Supplemental candidate only - documented explicitly per this task's
instruction, not a primary spinach source.** This dataset shows spinach
LEAVES (close-up, leaf-classification framing - the same style as the
sibling "Comprehensive Vegetable Leaf Disease Image Collection" dataset
researched alongside it), not whole spinach bunches/bags in a grocery or
fridge context. It does NOT by itself satisfy SmartPrep's domain-diversity
needs for the `spinach` class - first-party photography is still required
(see `data/FIRST_PARTY_COLLECTION_GUIDE.md`). Acquired anyway because the
task explicitly allows a small, straightforward supplemental acquisition,
and this one qualifies: the whole archive is ~9MB (confirmed via Mendeley's
file-listing API - a single `Root.zip` file entry), trivial to download in
full - no need for the byte-range partial-extraction machinery
`bangladeshi_vegetables.py` needed for a 2GB archive.

## Structure - verified directly

`Root/<class>/<filename>.jpg` - flat per-class folders, 6 winter vegetable
leaf classes (spinach, red amaranth, cabbage, mustard greens, lettuce,
radish leaves), 606 images total. Only `Root/spinach/` (109 images) is
acquired - the other 5 classes are out of scope (not SmartPrep classes, or
in cabbage's case not needed since it isn't one of our 13).

## Grouping

Same caveat as every other source with no specimen metadata: filenames are
sequential camera timestamps with no explicit specimen id. Grouped via the
same `cluster_near_duplicates` conservative near-duplicate clustering used
by `banglavegnet.py` and `bangladeshi_vegetables.py` - not a new heuristic.
"""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path

_ML_ROOT = Path(__file__).resolve().parents[2]
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from src.curation.duplicates import cluster_near_duplicates  # noqa: E402
from src.curation.validation import validate_image  # noqa: E402
from src.datasets.manifest import CandidateImage, write_candidates_csv  # noqa: E402

DOI = "10.17632/9c7crxrvmf.1"
DATASET_TITLE = "An image dataset for classification of vegetable"
DATASET_AUTHORS = "Suzana Sowket Gohona, Afsana Mimi, Mohammad Manzurul Islam"
LICENSE = "CC BY 4.0"
OFFICIAL_URL = "https://data.mendeley.com/datasets/9c7crxrvmf/1"
ZIP_DOWNLOAD_URL = (
    "https://data.mendeley.com/public-files/datasets/9c7crxrvmf/files/"
    "5d26ec34-4769-4396-9ce0-649bc6857541/file_downloaded"
)
ZIP_ENTRY_PREFIX = "Root/spinach/"
SMARTPREP_LABEL = "spinach"
SOURCE_LABEL = "spinach"  # this archive's own folder name - no rename needed
USER_AGENT = "smartprep-ml-dataset-acquisition/0.1 (research; see ml/data/README.md)"
REQUEST_TIMEOUT_SECONDS = 60
NEAR_DUPLICATE_MAX_DISTANCE = 5


def download_zip_bytes() -> bytes:
    """The whole archive is ~9MB - small enough to fetch in one plain GET,
    unlike `bangladeshi_vegetables.py`'s 2GB archive."""
    req = urllib.request.Request(ZIP_DOWNLOAD_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        return resp.read()


def _relative_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(_ML_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def acquire(output_dir: Path, max_images: int | None = None) -> list[CandidateImage]:
    class_dir = output_dir / SMARTPREP_LABEL
    class_dir.mkdir(parents=True, exist_ok=True)

    try:
        zip_bytes = download_zip_bytes()
    except (urllib.error.HTTPError, urllib.error.URLError) as exc:
        print(f"[abort] could not download the archive: {exc}", file=sys.stderr)
        return []

    zf = zipfile.ZipFile(BytesIO(zip_bytes))
    entries = [
        info
        for info in zf.infolist()
        if info.filename.startswith(ZIP_ENTRY_PREFIX) and info.filename.lower().endswith((".jpg", ".jpeg", ".png"))
    ]
    if max_images is not None:
        entries = sorted(entries, key=lambda i: i.filename)[:max_images]

    downloaded_paths: list[Path] = []
    for info in entries:
        dest = class_dir / f"veg_leaf_{Path(info.filename).name}"
        if not dest.exists():
            dest.write_bytes(zf.read(info))
        result = validate_image(str(dest))
        if not result.ok:
            print(f"  [reject] {dest.name}: {result.reason}", file=sys.stderr)
            dest.unlink(missing_ok=True)
            continue
        downloaded_paths.append(dest)

    if not downloaded_paths:
        print("  spinach (vegetable_leaf_spinach): 0 usable images", file=sys.stderr)
        return []

    groups = cluster_near_duplicates([str(p) for p in downloaded_paths], max_distance=NEAR_DUPLICATE_MAX_DISTANCE)
    groups = {p: _relative_path(Path(group_id)) for p, group_id in groups.items()}

    candidates = [
        CandidateImage(
            path=_relative_path(p),
            label=SMARTPREP_LABEL,
            group=groups[str(p)],
            source_dataset="vegetable_leaf_spinach",
            source_url=OFFICIAL_URL,
            license=LICENSE,
            original_id=p.name,
            first_party=False,
            source_label=SOURCE_LABEL,
        )
        for p in downloaded_paths
    ]
    n_groups = len({c.group for c in candidates})
    print(f"  spinach ({SOURCE_LABEL}): {len(candidates)} image(s) across {n_groups} group(s) [SUPPLEMENTAL - leaf-domain only, see module docstring]")
    return candidates


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output-dir", default=str(_ML_ROOT / "data" / "raw_acquired" / "vegetable_leaf_spinach"))
    parser.add_argument("--provenance-csv", default=str(_ML_ROOT / "data" / "provenance" / "vegetable_leaf_spinach.csv"))
    parser.add_argument("--max-images", type=int, default=None)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    print(f"Acquiring spinach (supplemental, leaf-domain) from {DATASET_TITLE!r} ({DOI}) into {output_dir}...")
    candidates = acquire(output_dir, max_images=args.max_images)

    if not candidates:
        print("\nNo candidates acquired - see stderr above for why.", file=sys.stderr)
        return

    provenance_path = Path(args.provenance_csv)
    write_candidates_csv(candidates, provenance_path)
    print(f"\nWrote {len(candidates)} candidate rows to {provenance_path}")


if __name__ == "__main__":
    main()

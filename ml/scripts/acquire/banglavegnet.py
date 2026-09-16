"""Acquire the RAW subset of five BanglaVegNet classes relevant to SmartPrep.

Source (verified current, official): Mendeley Data, DOI 10.17632/rtx9ngb68j.2
  "A Comprehensive Image Dataset of Vegetables Grown in Bangladesh"
  (the same record's v1 was titled "BanglaVegNet: A Multiclass Image Dataset
  of Traditional Vegetables in Bangladesh" - same dataset, renamed at v2).
License: CC BY 4.0. Authors, institution, and full citation fields are in
`banglavegnet_folders.json` under "dataset" - kept machine-readable there,
not only in this docstring.

## Why this script needs one manual step (documented, not bypassed)

Verified directly against Mendeley's own file-listing API
(`GET https://data.mendeley.com/api/datasets/rtx9ngb68j/files?version=2`):
the published structure IS as described - 42 class-specific folders, each
split into exactly two sub-folders (confirmed for 4 classes: Arum Lobe, Ash
Gourd, Beetroot, Bitter Melon):
  - a RAW folder: full-resolution JPGs, several MB each
  - a "processed" folder: the SAME image count, ~10-15KB each (almost
    certainly a resized/recompressed copy of the same raw originals, not
    independent images - the per-class raw and processed file COUNTS match
    exactly in every class checked)
Per this task's "prefer raw, avoid resized/duplicated derivatives"
instruction, this script downloads ONLY the raw folder for each class.

What is NOT scriptable: the dataset has 3,754+ files, and the public API's
unscoped file listing hard-caps at 100 results (`content-range: items
0-99/...`) with NO working override found after extensively testing every
plausible pagination mechanism (offset/limit/skip/take/page/marker query
params in many naming conventions, standard and custom `Range`/`Range-Unit`
headers, sort/reverse params, folder_id=root/empty/null, alternate API
versions/paths) - all either ignored (silently returning the same first 100
items) or 400. Listing files WITHIN a known folder_id works perfectly and
returns complete, correct results (verified: e.g. Arum Lobe's raw folder
correctly reports "items 0-12/13", all 13 files). The only missing piece is
discovering the folder_id for each of our 5 target classes, and the
alphabetically-first ~100 files only reach through "Bitter Melon" (4 of 42
classes) - well before Broccoli, Onion, Potato, Tomato, or Spinach.

The dataset's own interactive file browser (an Angular SPA) presumably
enumerates folder_ids through some client-side-only mechanism this script
cannot execute. Per this task's explicit instruction ("If Mendeley requires
manual download or has a download mechanism unsuitable for clean scripted
acquisition, document the manual step instead of bypassing it"), the ONE
manual step is: a human opens the dataset's file browser in a real browser,
navigates to each target class's RAW sub-folder, and copies that folder's
`folder_id` (a UUID, visible in the DevTools Network tab on the matching
`files?version=2&folder_id=...` request) into
`banglavegnet_folders.json`. See that file's own `_readme` field for the
exact steps. Everything after that (listing, downloading, validating,
grouping, provenance) is fully scripted, idempotent, and re-runs cleanly.

## Grouping (no explicit specimen metadata from this source)

Unlike Fruits-360 (whole variety folder = one group, from real metadata),
BanglaVegNet's raw folders have NO per-specimen structure at all - just
sequentially-numbered files (`Broccoli_0001.jpg`, `Broccoli_0002.jpg`, ...).
Assuming each image is an independent specimen would risk exactly the
mistake this task warns against ("do NOT assume image count equals
independent examples"). Instead, after downloading a class's images, this
script runs `src.curation.duplicates.cluster_near_duplicates` over them and
uses the resulting connected-component id as each image's `group` - so any
chain of visually near-identical photos (the burst/multi-angle-of-one-item
case) is conservatively kept together, while a photo with no near-duplicate
partner becomes its own singleton group. This is independent of, and
strictly more conservative than, treating every image as its own group.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

_ML_ROOT = Path(__file__).resolve().parents[2]
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from scripts.acquire._shared import USER_AGENT, download_file, relative_path  # noqa: E402
from src.curation.duplicates import cluster_near_duplicates  # noqa: E402
from src.curation.validation import validate_image  # noqa: E402
from src.datasets.manifest import CandidateImage, write_candidates_csv  # noqa: E402

DOI = "10.17632/rtx9ngb68j.2"
FILES_API = "https://data.mendeley.com/api/datasets/rtx9ngb68j/files"
DATASET_VERSION = 2
REQUEST_TIMEOUT_SECONDS = 30
DOWNLOAD_DELAY_SECONDS = 0.1

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "banglavegnet_folders.json"

# If a configured "raw" folder's files average smaller than this, they are
# almost certainly the PROCESSED subset, not raw (see module docstring's
# size-based evidence: raw is several MB/file, processed is ~10-15KB/file) -
# refuse rather than silently acquiring the wrong subset.
RAW_MIN_AVERAGE_SIZE_BYTES = 200_000

NEAR_DUPLICATE_MAX_DISTANCE = 5  # same default as src/curation/leakage.py


def load_config(config_path: Path = DEFAULT_CONFIG_PATH) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def list_folder_files(folder_id: str) -> list[dict]:
    url = f"{FILES_API}?version={DATASET_VERSION}&folder_id={folder_id}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        return json.load(resp)


def _relative_path(path: Path) -> str:
    return relative_path(path, _ML_ROOT)


def acquire_class(
    smartprep_label: str,
    source_label: str,
    folder_id: str,
    output_dir: Path,
    dataset_meta: dict,
    max_images: int | None = None,
) -> list[CandidateImage]:
    """Downloads (idempotently) every file in one RAW folder, validates it,
    and returns candidates with `group` left as EACH IMAGE'S OWN PATH
    temporarily - the caller replaces `group` with the real
    `cluster_near_duplicates` result once every image for this class is on
    disk (clustering needs all of a class's images at once, not one at a
    time)."""
    try:
        files = list_folder_files(folder_id)
    except urllib.error.HTTPError as exc:
        print(f"  [skip] {smartprep_label} ({source_label}): listing failed ({exc.code} {exc.reason})", file=sys.stderr)
        return []
    except urllib.error.URLError as exc:
        print(f"  [skip] {smartprep_label} ({source_label}): network error ({exc.reason})", file=sys.stderr)
        return []

    image_files = [f for f in files if f.get("filename", "").lower().endswith((".jpg", ".jpeg", ".png"))]
    if max_images is not None:
        image_files = sorted(image_files, key=lambda f: f["filename"])[:max_images]

    sizes = [f.get("size", 0) for f in image_files if f.get("size")]
    if sizes and (sum(sizes) / len(sizes)) < RAW_MIN_AVERAGE_SIZE_BYTES:
        avg_kb = (sum(sizes) / len(sizes)) / 1024
        print(
            f"  [ABORT] {smartprep_label} ({source_label}): folder_id {folder_id} averages "
            f"{avg_kb:.1f} KB/file - looks like the PROCESSED/compressed subset, not raw. "
            "Verify you copied the RAW folder_id (see banglavegnet_folders.json's _readme). "
            "Nothing downloaded for this class.",
            file=sys.stderr,
        )
        return []

    class_dir = output_dir / smartprep_label
    class_dir.mkdir(parents=True, exist_ok=True)

    downloaded_paths: list[Path] = []
    provenance_by_path: dict[Path, dict] = {}
    for f in image_files:
        dest = class_dir / f"banglavegnet_{f['filename']}"
        content = f.get("content_details", {})
        if not dest.exists():
            download_url = content.get("download_url")
            if not download_url:
                print(f"  [skip] {f['filename']}: no download_url in listing", file=sys.stderr)
                continue
            try:
                download_file(download_url, dest)
                time.sleep(DOWNLOAD_DELAY_SECONDS)
            except (urllib.error.HTTPError, urllib.error.URLError) as exc:
                print(f"  [skip] {dest.name}: download failed ({exc})", file=sys.stderr)
                continue

        result = validate_image(str(dest))
        if not result.ok:
            print(f"  [reject] {dest.name}: {result.reason}", file=sys.stderr)
            dest.unlink(missing_ok=True)
            continue

        downloaded_paths.append(dest)
        provenance_by_path[dest] = {
            "download_id": f.get("id", ""),
            "original_filename": f.get("filename", ""),
        }

    if not downloaded_paths:
        print(f"  {smartprep_label} ({source_label}): 0 usable images", file=sys.stderr)
        return []

    # Grouping: conservative near-duplicate clustering, since this source
    # gives us no specimen/session metadata at all (see module docstring).
    # Clustering itself needs real, absolute paths to open and hash the
    # files, but the resulting group id (the lexicographically-smallest
    # member path - see `cluster_near_duplicates`) must be relativized
    # before it goes in the manifest, same as `path` - a group id
    # containing a local absolute path (with a username in it) would leak
    # local machine details into what's meant to be a portable, committable
    # provenance record.
    groups = cluster_near_duplicates([str(p) for p in downloaded_paths], max_distance=NEAR_DUPLICATE_MAX_DISTANCE)
    groups = {p: _relative_path(Path(group_id)) for p, group_id in groups.items()}

    candidates = [
        CandidateImage(
            path=_relative_path(p),
            label=smartprep_label,
            group=groups[str(p)],
            source_dataset="banglavegnet",
            source_url=f"{dataset_meta['official_url']}?folder_id={folder_id}",
            license=dataset_meta["license"],
            original_id=provenance_by_path[p]["original_filename"],
            first_party=False,
            source_label=source_label,
        )
        for p in downloaded_paths
    ]
    n_groups = len({c.group for c in candidates})
    print(f"  {smartprep_label} ({source_label}): {len(candidates)} image(s) across {n_groups} group(s)")
    return candidates


def acquire(output_dir: Path, config: dict, max_images_per_class: int | None = None) -> list[CandidateImage]:
    dataset_meta = config["dataset"]
    candidates: list[CandidateImage] = []
    skipped_unconfigured: list[str] = []

    for smartprep_label, class_cfg in config["classes"].items():
        folder_id = class_cfg.get("folder_id_raw")
        source_label = class_cfg.get("source_label", smartprep_label)
        if not folder_id:
            skipped_unconfigured.append(smartprep_label)
            continue
        candidates.extend(
            acquire_class(smartprep_label, source_label, folder_id, output_dir, dataset_meta, max_images_per_class)
        )

    if skipped_unconfigured:
        print(
            f"\n[not configured - no folder_id_raw set, nothing guessed] {sorted(skipped_unconfigured)}\n"
            "See banglavegnet_folders.json's '_readme' for the one manual step needed.",
            file=sys.stderr,
        )

    return candidates


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output-dir", default=str(_ML_ROOT / "data" / "raw_acquired" / "banglavegnet"))
    parser.add_argument("--provenance-csv", default=str(_ML_ROOT / "data" / "provenance" / "banglavegnet.csv"))
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH))
    parser.add_argument("--max-images-per-class", type=int, default=None)
    args = parser.parse_args()

    config = load_config(Path(args.config))
    output_dir = Path(args.output_dir)
    print(f"Acquiring BanglaVegNet raw subset into {output_dir}...")
    candidates = acquire(output_dir, config, max_images_per_class=args.max_images_per_class)

    if not candidates:
        print(
            "\nNo candidates acquired (no class had a configured folder_id_raw, or every "
            "configured class failed to download/validate). Not writing an empty provenance "
            "CSV over a possibly-real one - see stderr above for exactly why.",
            file=sys.stderr,
        )
        return

    provenance_path = Path(args.provenance_csv)
    write_candidates_csv(candidates, provenance_path)
    print(f"\nWrote {len(candidates)} candidate rows to {provenance_path}")


if __name__ == "__main__":
    main()

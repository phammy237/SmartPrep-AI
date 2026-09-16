"""Acquire a bounded, licensed sample of Fruits-360 images.

Covers ONLY the classes this specific repo actually has among SmartPrep's 13
(verified directly against the GitHub Contents API, not a secondhand summary):
apple, banana, carrot. The other 10 classes (tomato, onion, potato, broccoli,
spinach, egg, milk, bread, chicken, cheese) are NOT in this dataset - see
`ml/data/README.md` for their source status.

Source (verified current, official): https://github.com/fruits-360/fruits-360-100x100
License: CC BY-SA 4.0 (per that repo's LICENSE file, checked at acquisition
time - see ml/data/README.md for the full license note, including the
ShareAlike obligation on redistributed derivatives).

How this fetches data:
  - Directory LISTING via the GitHub REST Contents API
    (api.github.com/repos/.../contents/...) - unauthenticated, 60
    requests/hour. This script issues at most one listing call per
    (class, variety) pair, which is small (see CLASS_VARIETIES below).
  - Actual image BYTES via each listing entry's `download_url`
    (raw.githubusercontent.com), which is not subject to the API rate limit.
  - No git clone (avoids pulling the whole ~1.1GB repo for a few dozen
    images), no scraping (this is the dataset's own official, documented
    distribution mechanism), no credentials.

Turntable grouping (why this matters for leakage prevention): every image in
one Fruits-360 variety folder (e.g. "Apple Golden 1") is a rotation frame of
the SAME handful of physical fruit specimens shot on the same turntable
against the same background. These are near-duplicates of each other, not
independent examples - so the ENTIRE variety folder is treated as ONE group
(`fruits360:<class>:<variety>`), which `assign_splits` then keeps entirely
within a single train/val/test split. This script only samples a BOUNDED
number of frames per variety (see MAX_IMAGES_PER_VARIETY) - taking every
frame of every rotation would not add independent information, only inflate
a single group's size.

Idempotency: re-running this script skips any (variety, filename) whose
destination file already exists on disk - it never re-downloads or
overwrites an existing file. The provenance CSV is fully rewritten each run
(from whatever image files currently exist on disk plus any newly downloaded
ones), since it is a derived index, not raw data.

No credentials are used or required. Nothing in this script uploads,
scrapes, or touches any site other than the two officially documented GitHub
endpoints above.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

_ML_ROOT = Path(__file__).resolve().parents[2]
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from scripts.acquire._shared import USER_AGENT, download_file, relative_path  # noqa: E402
from src.curation.validation import validate_image  # noqa: E402
from src.datasets.manifest import CandidateImage, write_candidates_csv  # noqa: E402

REPO = "fruits-360/fruits-360-100x100"
REF = "main"
SOURCE_REPO_URL = f"https://github.com/{REPO}"
LICENSE = "CC BY-SA 4.0"
SPLIT_DIR = "Training"  # Fruits-360's own train/test split is irrelevant - we resplit ourselves

# class -> Fruits-360 variety folder names to sample, verified to exist via
# `GET /repos/fruits-360/fruits-360-100x100/contents/Training?ref=main`.
# Only classes/varieties actually present in THIS repo are listed.
CLASS_VARIETIES: dict[str, list[str]] = {
    "apple": ["Apple Braeburn 1", "Apple Golden 1", "Apple Granny Smith 1"],
    "banana": ["Banana 1", "Banana Lady Finger 1"],
    "carrot": ["Carrot 1"],
}

MAX_IMAGES_PER_VARIETY_DEFAULT = 15
REQUEST_TIMEOUT_SECONDS = 30
DOWNLOAD_DELAY_SECONDS = 0.1  # be polite to raw.githubusercontent.com between file downloads


def _api_get(url: str) -> list[dict]:
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        return json.load(resp)


def list_variety_files(variety: str) -> list[dict]:
    encoded = urllib.parse.quote(variety)
    url = f"https://api.github.com/repos/{REPO}/contents/{SPLIT_DIR}/{encoded}?ref={REF}"
    return _api_get(url)


def _relative_path(path: Path) -> str:
    return relative_path(path, _ML_ROOT)


def acquire(
    output_dir: Path,
    max_per_variety: int = MAX_IMAGES_PER_VARIETY_DEFAULT,
    class_varieties: dict[str, list[str]] | None = None,
) -> list[CandidateImage]:
    class_varieties = class_varieties or CLASS_VARIETIES
    candidates: list[CandidateImage] = []

    for label, varieties in class_varieties.items():
        class_dir = output_dir / label
        for variety in varieties:
            group = f"fruits360:{label}:{variety}"
            try:
                files = list_variety_files(variety)
            except urllib.error.HTTPError as exc:
                print(f"  [skip] {label} / {variety}: listing failed ({exc.code} {exc.reason})", file=sys.stderr)
                continue
            except urllib.error.URLError as exc:
                print(f"  [skip] {label} / {variety}: network error ({exc.reason})", file=sys.stderr)
                continue

            image_files = sorted(
                (f for f in files if f.get("type") == "file" and f["name"].lower().endswith((".jpg", ".jpeg", ".png"))),
                key=lambda f: f["name"],
            )[:max_per_variety]

            class_dir.mkdir(parents=True, exist_ok=True)
            kept = 0
            for f in image_files:
                dest = class_dir / f"fruits360_{variety.replace(' ', '_')}_{f['name']}"
                if not dest.exists():
                    try:
                        download_file(f["download_url"], dest)  # shared default timeout matches REQUEST_TIMEOUT_SECONDS above
                        time.sleep(DOWNLOAD_DELAY_SECONDS)
                    except (urllib.error.HTTPError, urllib.error.URLError) as exc:
                        print(f"  [skip] {dest.name}: download failed ({exc})", file=sys.stderr)
                        continue

                result = validate_image(str(dest))
                if not result.ok:
                    print(f"  [reject] {dest.name}: {result.reason}", file=sys.stderr)
                    dest.unlink(missing_ok=True)
                    continue

                candidates.append(
                    CandidateImage(
                        path=_relative_path(dest),
                        label=label,
                        group=group,
                        source_dataset="fruits360",
                        source_url=f"{SOURCE_REPO_URL}/blob/{REF}/{SPLIT_DIR}/{urllib.parse.quote(variety)}/{f['name']}",
                        license=LICENSE,
                        original_id=f["name"],
                        first_party=False,
                        # Fruits-360's own top-level category name (the first
                        # word of its variety folder, e.g. "Apple" from
                        # "Apple Braeburn 1") - happens to be a trivial
                        # identity mapping onto our `label` here, but recorded
                        # anyway so every acquired source is equally
                        # traceable back to its own taxonomy, per the same
                        # convention BanglaVegNet's acquisition needs for its
                        # real renames (e.g. "Green Spinach" -> "spinach").
                        source_label=variety.split()[0],
                    )
                )
                kept += 1
            print(f"  {label} / {variety}: {kept} candidate image(s) (1 group)")

    return candidates


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output-dir", default=str(_ML_ROOT / "data" / "raw_acquired" / "fruits360"))
    parser.add_argument("--provenance-csv", default=str(_ML_ROOT / "data" / "provenance" / "fruits360.csv"))
    parser.add_argument("--max-per-variety", type=int, default=MAX_IMAGES_PER_VARIETY_DEFAULT)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    print(f"Acquiring Fruits-360 sample into {output_dir} (max {args.max_per_variety} images/variety)...")
    candidates = acquire(output_dir, max_per_variety=args.max_per_variety)

    provenance_path = Path(args.provenance_csv)
    write_candidates_csv(candidates, provenance_path)
    print(f"\nWrote {len(candidates)} candidate rows to {provenance_path}")

    groups = sorted({c.group for c in candidates})
    print(f"Groups (variety folders): {len(groups)}")
    for label in class_varieties_labels(candidates):
        n_groups = len({c.group for c in candidates if c.label == label})
        n_images = sum(1 for c in candidates if c.label == label)
        print(f"  {label}: {n_images} image(s) across {n_groups} group(s)")


def class_varieties_labels(candidates: list[CandidateImage]) -> list[str]:
    seen: list[str] = []
    for c in candidates:
        if c.label not in seen:
            seen.append(c.label)
    return seen


if __name__ == "__main__":
    main()

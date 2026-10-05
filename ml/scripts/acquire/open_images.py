"""Acquire per-class images from Google's Open Images V7 (validation + test splits).

Source (verified current, official): https://storage.googleapis.com/openimages
  - `v7/oidv7-class-descriptions.csv`            MID -> display name
  - `v7/oidv7-{val,test}-annotations-human-imagelabels.csv`
        human-verified image-level labels (Confidence 1.0 = verified present)
  - `2018_04/{validation,test}/*-images-with-rotation.csv`
        per-image OriginalURL, License, Author, OriginalMD5, Thumbnail300KURL
License: Google lists the annotations as CC BY 4.0 and the images as
CC BY 2.0 (Flickr). Google disclaims per-image license accuracy, so this
script keeps ONLY images whose own `License` field is the CC BY 2.0 URL and
records each image's author in an attribution sidecar CSV
(`data/provenance/attribution/open_images_v7.csv`) - CC BY requires credit.
The sidecar lives in a subdirectory on purpose: `audit_dataset.py`
auto-discovers `data/provenance/*.csv` and expects the CandidateImage schema.

## Why validation + test only (by default)

The train-split human label file is 2.7GB; validation + test are ~120MB of
labels for ~166k images, which is plenty for a few hundred images per class.
Pass `--splits train` only if you really want the large file.

## Selection (what "usable" means)

An image is kept for class C only if all of these hold:
  * C is a human-verified positive image-level label;
  * NO other SmartPrep class is also a verified positive (multi-ingredient
    scenes have no single correct v0 label - see ml/README.md);
  * none of `EXCLUDE_LABELS` (Pizza, Cake, Dish, Salad, Bird, ...) is a
    verified positive - this is what removes plated meals, cheese-on-pizza,
    live chickens, etc. It is a heuristic, not a guarantee: spot-check the
    output (the README's "domain" caveats still apply - these are Flickr
    photos, not fridge/pantry shots);
  * License is CC BY 2.0.

## Grouping

Each image is a different photo, but one photographer's burst of shots can be
near-identical. Group = (class, Flickr author), and at most `--max-per-author`
images are taken from any one author per class, so no author dominates and
grouped splitting keeps an author's photos in a single split.

## Files

Images come from Open Images' own public S3 bucket
(`open-images-dataset.s3.amazonaws.com/<split>/<ImageID>.jpg`), the same
source the official downloader and FiftyOne use. The Flickr URLs in the
metadata CSV are years old and mostly dead or connection-reset (measured:
~2 in 12 worked). `OriginalMD5` is NOT checked: it describes the Flickr
original, and the S3 copies are re-encoded (measured: 0 in 12 match), so
integrity relies on `validate_image` instead.
"""

from __future__ import annotations

import argparse
import csv
import random
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

_ML_ROOT = Path(__file__).resolve().parents[2]
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from scripts.acquire._shared import USER_AGENT, relative_path  # noqa: E402
from src.curation.validation import validate_image  # noqa: E402
from src.datasets.manifest import CandidateImage, write_candidates_csv  # noqa: E402

BASE_URL = "https://storage.googleapis.com/openimages"
CLASS_DESCRIPTIONS_URL = f"{BASE_URL}/v7/oidv7-class-descriptions.csv"
LABELS_URLS = {
    "validation": f"{BASE_URL}/v7/oidv7-val-annotations-human-imagelabels.csv",
    "test": f"{BASE_URL}/v7/oidv7-test-annotations-human-imagelabels.csv",
    "train": f"{BASE_URL}/v7/oidv7-train-annotations-human-imagelabels.csv",
}
IMAGES_URLS = {
    "validation": f"{BASE_URL}/2018_04/validation/validation-images-with-rotation.csv",
    "test": f"{BASE_URL}/2018_04/test/test-images-with-rotation.csv",
    "train": f"{BASE_URL}/2018_04/train/train-images-boxable-with-rotation.csv",
}
DEFAULT_SPLITS = ("validation", "test")
IMAGE_URL_TEMPLATE = "https://open-images-dataset.s3.amazonaws.com/{split}/{image_id}.jpg"

SOURCE_DATASET = "open_images_v7"
LICENSE_URL = "https://creativecommons.org/licenses/by/2.0/"
LICENSE = "CC BY 2.0"
REQUEST_TIMEOUT_SECONDS = 60
DOWNLOAD_WORKERS = 8

# SmartPrep class -> Open Images display name. All 13 exist in V7's class list.
CLASS_TO_OI_NAME = {
    "apple": "Apple",
    "banana": "Banana",
    "tomato": "Tomato",
    "onion": "Onion",
    "potato": "Potato",
    "carrot": "Carrot",
    "broccoli": "Broccoli",
    "spinach": "Spinach",
    "egg": "Egg",
    "milk": "Milk",
    "bread": "Bread",
    "chicken": "Chicken",
    "cheese": "Cheese",
}
# Extended whole-ingredient set (opt-in via --extended). Chosen as items
# that look like themselves as a single raw item; prepared-food labels
# (pasta, rice, salmon fillet, steak...) are deliberately left out. Which of
# these end up usable depends on real counts after filtering - see
# scripts/refresh_and_train.py, which only trains classes with enough data.
EXTRA_CLASS_TO_OI_NAME = {
    name.lower().replace(" ", "_"): name
    for name in (
        "Strawberry", "Grape", "Pineapple", "Mango", "Pear", "Peach", "Watermelon", "Cherry",
        "Blueberry", "Raspberry", "Kiwifruit", "Grapefruit", "Coconut", "Pomegranate", "Papaya",
        "Avocado", "Fig", "Apricot", "Cantaloupe", "Guava", "Lychee",
        "Cucumber", "Pumpkin", "Zucchini", "Garlic", "Mushroom", "Cabbage", "Cauliflower",
        "Lettuce", "Bell pepper", "Chili pepper", "Corn", "Eggplant", "Celery", "Asparagus",
        "Sweet potato", "Kale", "Ginger", "Beet", "Radish", "Turnip", "Leek", "Artichoke",
        "Brussels sprout", "Green bean", "Peas", "Olive", "Basil", "Parsley",
        "Shrimp", "Sausage", "Bacon", "Butter", "Yogurt", "Tofu",
    )
}
ALL_CLASS_TO_OI_NAME = {**CLASS_TO_OI_NAME, **EXTRA_CLASS_TO_OI_NAME}

# Chicken is opt-in: its OI label is dominated by live birds and cooked dishes.
DEFAULT_CLASSES = tuple(c for c in CLASS_TO_OI_NAME if c != "chicken")

# Verified-positive labels that disqualify an image (plated/prepared food,
# live animals). Display names, resolved to MIDs at runtime.
EXCLUDE_LABELS = (
    "Pizza", "Cake", "Cookie", "Sandwich", "Hamburger", "Cheeseburger", "Hot dog",
    "Salad", "Soup", "Pasta", "Dessert", "Fast food", "Dish", "Cuisine", "Meal",
    "Baked goods", "Omelette", "Cooking", "Bird",
)


def cache_file(url: str, cache_dir: Path) -> Path:
    """Download `url` into `cache_dir` once (streamed; some files are 100MB+)."""
    dest = cache_dir / url.rsplit("/", 1)[-1]
    if dest.exists():
        return dest
    cache_dir.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp, open(tmp, "wb") as f:
        while chunk := resp.read(1 << 20):
            f.write(chunk)
    tmp.replace(dest)
    return dest


def read_class_descriptions(path: Path) -> dict[str, str]:
    """display name -> MID."""
    with open(path, newline="", encoding="utf-8") as f:
        return {row[1]: row[0] for row in csv.reader(f) if len(row) >= 2}


def read_positive_labels(path: Path, wanted_mids: set[str]) -> dict[str, set[str]]:
    """image id -> set of wanted MIDs that are human-verified positives
    (Confidence 1.0). Streams the file; only wanted MIDs are retained."""
    positives: dict[str, set[str]] = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["LabelName"] in wanted_mids and float(row["Confidence"]) >= 1.0:
                positives.setdefault(row["ImageID"], set()).add(row["LabelName"])
    return positives


def read_image_metadata(path: Path) -> dict[str, dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as f:
        return {row["ImageID"]: row for row in csv.DictReader(f)}


def select_images(
    positives: dict[str, set[str]],
    metadata: dict[str, dict[str, str]],
    mid_to_class: dict[str, str],
    exclude_mids: set[str],
    per_class: int,
    max_per_author: int,
    seed: int,
) -> dict[str, list[dict[str, str]]]:
    """Pure selection logic (no I/O): class -> metadata rows, deterministic for
    a given seed, honoring the single-class / exclusion / license / per-author
    rules from the module docstring."""
    by_class: dict[str, list[str]] = {c: [] for c in mid_to_class.values()}
    for image_id, mids in positives.items():
        target_mids = {m for m in mids if m in mid_to_class}
        if len(target_mids) != 1 or (mids & exclude_mids):
            continue
        meta = metadata.get(image_id)
        if meta is None or meta.get("License") != LICENSE_URL or not meta.get("Author"):
            continue
        by_class[mid_to_class[next(iter(target_mids))]].append(image_id)

    rng = random.Random(seed)
    selected: dict[str, list[dict[str, str]]] = {}
    for label, image_ids in by_class.items():
        image_ids.sort()  # stable base order, then seeded shuffle
        rng.shuffle(image_ids)
        per_author: dict[str, int] = {}
        chosen: list[dict[str, str]] = []
        for image_id in image_ids:
            meta = metadata[image_id]
            author = meta["AuthorProfileURL"] or meta["Author"]
            if per_author.get(author, 0) >= max_per_author:
                continue
            per_author[author] = per_author.get(author, 0) + 1
            chosen.append(meta)
            if len(chosen) >= per_class:
                break
        selected[label] = chosen
    return selected


def author_group(label: str, meta: dict[str, str]) -> str:
    """Group key = (class, author). Splitting is stratified per class, so a
    photographer's apple photos and egg photos are independent groups; keying
    on the author alone would make one group straddle two classes' splits."""
    return f"{SOURCE_DATASET}:{label}:{meta['AuthorProfileURL'] or meta['Author']}"


def fetch_image(meta: dict[str, str], dest: Path) -> bool:
    """Download one image from the Open Images S3 bucket; True on success
    (valid image). Retries once on a transient network error."""
    url = IMAGE_URL_TEMPLATE.format(split=meta["Subset"], image_id=meta["ImageID"])
    for _attempt in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
                data = resp.read()
            break
        except (urllib.error.URLError, TimeoutError, OSError):
            data = None
    if data is None:
        return False
    dest.write_bytes(data)
    if not validate_image(str(dest)).ok:
        dest.unlink(missing_ok=True)
        return False
    return True


def acquire(
    output_dir: Path,
    cache_dir: Path,
    classes: tuple[str, ...] = DEFAULT_CLASSES,
    splits: tuple[str, ...] = DEFAULT_SPLITS,
    per_class: int = 300,
    max_per_author: int = 5,
    seed: int = 42,
    fetch=fetch_image,
) -> tuple[list[CandidateImage], list[dict[str, str]]]:
    """Returns (candidates, attribution rows). `fetch` is injectable for tests."""
    descriptions = read_class_descriptions(cache_file(CLASS_DESCRIPTIONS_URL, cache_dir))
    mid_to_class: dict[str, str] = {}
    for label in classes:
        oi_name = ALL_CLASS_TO_OI_NAME[label]
        if oi_name not in descriptions:
            print(f"  [skip] {label}: {oi_name!r} not in Open Images class list", file=sys.stderr)
            continue
        mid_to_class[descriptions[oi_name]] = label
    # Other SmartPrep classes (even if not requested now) still disqualify an
    # image: it would show a second ingredient.
    other_class_mids = {descriptions[n] for n in ALL_CLASS_TO_OI_NAME.values() if n in descriptions}
    exclude_mids = {descriptions[n] for n in EXCLUDE_LABELS if n in descriptions}
    wanted_mids = other_class_mids | exclude_mids

    positives: dict[str, set[str]] = {}
    metadata: dict[str, dict[str, str]] = {}
    for split in splits:
        print(f"  reading {split} labels + metadata...")
        for image_id, mids in read_positive_labels(cache_file(LABELS_URLS[split], cache_dir), wanted_mids).items():
            positives.setdefault(image_id, set()).update(mids)
        metadata.update(read_image_metadata(cache_file(IMAGES_URLS[split], cache_dir)))

    # Non-requested SmartPrep classes must disqualify but never be selected.
    selection_map = dict(mid_to_class)
    exclude_for_selection = exclude_mids | (other_class_mids - set(mid_to_class))
    selected = select_images(positives, metadata, selection_map, exclude_for_selection, per_class, max_per_author, seed)

    candidates: list[CandidateImage] = []
    attribution: list[dict[str, str]] = []
    for label, metas in selected.items():
        class_dir = output_dir / label
        class_dir.mkdir(parents=True, exist_ok=True)
        jobs = [(m, class_dir / f"oi_{m['ImageID']}.jpg") for m in metas]
        with ThreadPoolExecutor(DOWNLOAD_WORKERS) as pool:
            ok = list(pool.map(lambda j: j[1].exists() or fetch(j[0], j[1]), jobs))
        kept = 0
        for (meta, dest), success in zip(jobs, ok):
            if not success:
                continue
            kept += 1
            candidates.append(
                CandidateImage(
                    path=relative_path(dest, _ML_ROOT),
                    label=label,
                    group=author_group(label, meta),
                    source_dataset=SOURCE_DATASET,
                    source_url=meta["OriginalLandingURL"],
                    license=LICENSE,
                    original_id=meta["ImageID"],
                    first_party=False,
                    source_label=ALL_CLASS_TO_OI_NAME[label],
                )
            )
            attribution.append(
                {
                    "image_id": meta["ImageID"],
                    "label": label,
                    "author": meta["Author"],
                    "author_profile_url": meta["AuthorProfileURL"],
                    "title": meta["Title"],
                    "landing_url": meta["OriginalLandingURL"],
                    "license": LICENSE_URL,
                }
            )
        print(f"  {label}: {kept}/{len(metas)} image(s) downloaded ({len(metas)} selected)")
    return candidates, attribution


def write_attribution_csv(rows: list[dict[str, str]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["image_id", "label", "author", "author_profile_url", "title", "landing_url", "license"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--classes", nargs="+", default=None, choices=list(ALL_CLASS_TO_OI_NAME))
    parser.add_argument("--extended", action="store_true", help="Also pull EXTRA_CLASS_TO_OI_NAME (~55 more ingredients).")
    parser.add_argument("--splits", nargs="+", default=list(DEFAULT_SPLITS), choices=list(LABELS_URLS))
    parser.add_argument("--per-class", type=int, default=300)
    parser.add_argument("--max-per-author", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output-dir", default=str(_ML_ROOT / "data" / "raw_acquired" / "open_images"))
    parser.add_argument("--cache-dir", default=str(_ML_ROOT / "data" / "raw_acquired" / "open_images" / "_cache"))
    parser.add_argument("--provenance-csv", default=str(_ML_ROOT / "data" / "provenance" / "open_images.csv"))
    parser.add_argument(
        "--attribution-csv", default=str(_ML_ROOT / "data" / "provenance" / "attribution" / "open_images_v7.csv")
    )
    args = parser.parse_args()

    classes = tuple(args.classes or (DEFAULT_CLASSES + (tuple(EXTRA_CLASS_TO_OI_NAME) if args.extended else ())))
    print(f"Acquiring Open Images V7 ({', '.join(args.splits)}) classes: {', '.join(classes)}")
    candidates, attribution = acquire(
        Path(args.output_dir),
        Path(args.cache_dir),
        classes=classes,
        splits=tuple(args.splits),
        per_class=args.per_class,
        max_per_author=args.max_per_author,
        seed=args.seed,
    )
    if not candidates:
        print("\nNo candidates acquired.", file=sys.stderr)
        return
    write_candidates_csv(candidates, Path(args.provenance_csv))
    write_attribution_csv(attribution, Path(args.attribution_csv))
    print(f"\nWrote {len(candidates)} rows to {args.provenance_csv} and attribution to {args.attribution_csv}")


if __name__ == "__main__":
    main()

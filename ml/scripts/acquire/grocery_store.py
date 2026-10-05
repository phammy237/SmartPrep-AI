"""Acquire grocery-store produce/dairy photos from the Grocery Store Dataset (KTH).

Source (verified current): https://github.com/marcusklasson/GroceryStoreDataset
  Klasson, Zhang, Kjellstrom. "A Hierarchical Grocery Store Image Dataset with
  Visual and Semantic Labels" (WACV 2019). License: MIT (repository LICENSE).
  5,502 smartphone photos taken in real grocery stores, laid out as
  `dataset/<split>/<Category>/<Class>/<Variety>/<file>.jpg`
  (Category is Fruit / Vegetables / Packages).

Why this source: unlike studio or lab datasets, these are in-store phone
photos, which is closer to SmartPrep's use than Fruits-360 - and it adds
classes Open Images barely has (lime, plum, passion fruit, nectarine, plus
well-populated milk/yoghurt cartons). Only classes that map onto a SmartPrep
class are fetched; juice, plant milks, sour cream etc. are skipped.

Grouping: group = the dataset's own `<Variety>` folder (one product/variety
shot repeatedly in a store). That is deliberately conservative - consecutive
shots of the same item are in one group, so they can never straddle splits -
and it means a class needs several varieties before it has enough groups to
train (refresh_and_train.py enforces that).

Files come from raw.githubusercontent.com; the file listing is one call to
GitHub's git-trees API (not truncated for this repo).
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

_ML_ROOT = Path(__file__).resolve().parents[2]
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from scripts.acquire._shared import USER_AGENT, relative_path  # noqa: E402
from src.curation.duplicates import cluster_near_duplicates  # noqa: E402
from src.curation.validation import validate_image  # noqa: E402
from src.datasets.manifest import CandidateImage, write_candidates_csv  # noqa: E402

REPO = "marcusklasson/GroceryStoreDataset"
TREE_URL = f"https://api.github.com/repos/{REPO}/git/trees/master?recursive=1"
RAW_URL = f"https://raw.githubusercontent.com/{REPO}/master/"
OFFICIAL_URL = f"https://github.com/{REPO}"
SOURCE_DATASET = "grocery_store_kth"
LICENSE = "MIT"
REQUEST_TIMEOUT_SECONDS = 60
DOWNLOAD_WORKERS = 8
NEAR_DUPLICATE_MAX_DISTANCE = 5

# KTH `<Class>` folder -> SmartPrep label. Anything not listed is skipped.
CLASS_MAP = {
    "Apple": "apple", "Avocado": "avocado", "Banana": "banana", "Kiwi": "kiwifruit",
    "Lemon": "lemon", "Lime": "lime", "Mango": "mango", "Nectarine": "nectarine",
    "Orange": "orange", "Papaya": "papaya", "Passion-Fruit": "passion_fruit",
    "Peach": "peach", "Pear": "pear", "Pineapple": "pineapple", "Plum": "plum",
    "Pomegranate": "pomegranate", "Red-Grapefruit": "grapefruit",
    "Asparagus": "asparagus", "Aubergine": "eggplant", "Brown-Cap-Mushroom": "mushroom",
    "Mushroom": "mushroom", "Cabbage": "cabbage", "Carrots": "carrot", "Cucumber": "cucumber",
    "Garlic": "garlic", "Ginger": "ginger", "Leek": "leek", "Onion": "onion",
    "Pepper": "bell_pepper", "Potato": "potato", "Red-Beet": "beet", "Tomato": "tomato",
    "Zucchini": "zucchini", "Milk": "milk", "Yoghurt": "yogurt",
}


def fetch_tree() -> list[str]:
    """All repo file paths (network)."""
    req = urllib.request.Request(TREE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        tree = json.load(resp)
    if tree.get("truncated"):
        raise RuntimeError("GitHub tree listing was truncated - cannot trust the file list")
    return [t["path"] for t in tree["tree"] if t.get("type") == "blob"]


def parse_entries(paths: list[str]) -> list[dict[str, str]]:
    """Pure: keep `dataset/<split>/<Category>/<Class>/<Variety>/<file>.jpg` rows
    whose Class maps to a SmartPrep label."""
    entries = []
    for path in paths:
        parts = path.split("/")
        if len(parts) not in (5, 6) or parts[0] != "dataset" or parts[1] not in ("train", "val", "test"):
            continue
        if not path.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        # Classes with product varieties have a `<Variety>` folder (6 parts);
        # flat classes (banana, carrots, ...) do not (5 parts) -> variety "".
        _, _split, _category, kth_class, *rest = parts
        variety, filename = ("", rest[0]) if len(rest) == 1 else (rest[0], rest[1])
        label = CLASS_MAP.get(kth_class)
        if label is None:
            continue
        entries.append({"path": path, "label": label, "kth_class": kth_class, "variety": variety, "filename": filename})
    return entries


def download_image(path: str, dest: Path) -> bool:
    try:
        req = urllib.request.Request(RAW_URL + urllib.parse.quote(path), headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            data = resp.read()
    except (urllib.error.URLError, TimeoutError, OSError):
        return False
    dest.write_bytes(data)
    if not validate_image(str(dest)).ok:
        dest.unlink(missing_ok=True)
        return False
    return True


def acquire(
    output_dir: Path,
    labels: set[str] | None = None,
    max_per_class: int | None = None,
    list_paths=fetch_tree,
    download=download_image,
) -> list[CandidateImage]:
    entries = parse_entries(list_paths())
    if labels is not None:
        entries = [e for e in entries if e["label"] in labels]
    entries.sort(key=lambda e: e["path"])
    if max_per_class is not None:
        kept: list[dict[str, str]] = []
        counts: dict[str, int] = {}
        for e in entries:
            if counts.get(e["label"], 0) < max_per_class:
                counts[e["label"]] = counts.get(e["label"], 0) + 1
                kept.append(e)
        entries = kept

    jobs = []
    for e in entries:
        # train/val/test folder is the dataset's own split; we ignore it (our
        # splitter is group-aware), so keep the KTH split out of the name.
        dest_dir = output_dir / e["label"]
        dest_dir.mkdir(parents=True, exist_ok=True)
        stem = Path(e["filename"]).stem
        jobs.append((e, dest_dir / f"kth_{e['kth_class']}_{e['variety'] or 'flat'}_{stem}.jpg"))

    with ThreadPoolExecutor(DOWNLOAD_WORKERS) as pool:
        results = list(pool.map(lambda j: j[1].exists() or download(j[0]["path"], j[1]), jobs))

    kept = [(e, dest) for (e, dest), ok in zip(jobs, results) if ok]

    # Flat classes have no variety folder to group by: fall back to the same
    # conservative near-duplicate clustering the other no-metadata sources use.
    flat_groups: dict[str, str] = {}
    for kth_class in {e["kth_class"] for e, _ in kept if not e["variety"]}:
        paths = [str(dest) for e, dest in kept if e["kth_class"] == kth_class and not e["variety"]]
        clusters = cluster_near_duplicates(paths, max_distance=NEAR_DUPLICATE_MAX_DISTANCE)
        flat_groups.update({p: f"cluster:{Path(g).stem}" for p, g in clusters.items()})

    candidates = []
    for e, dest in kept:
        group_tail = e["variety"] or flat_groups[str(dest)]
        candidates.append(
            CandidateImage(
                path=relative_path(dest, _ML_ROOT),
                label=e["label"],
                group=f"{SOURCE_DATASET}:{e['kth_class']}:{group_tail}",
                source_dataset=SOURCE_DATASET,
                source_url=OFFICIAL_URL,
                license=LICENSE,
                original_id=e["path"],
                first_party=False,
                source_label=e["kth_class"],
            )
        )
    by_label: dict[str, int] = {}
    for c in candidates:
        by_label[c.label] = by_label.get(c.label, 0) + 1
    for label, n in sorted(by_label.items()):
        n_groups = len({c.group for c in candidates if c.label == label})
        print(f"  {label}: {n} image(s) across {n_groups} group(s)")
    return candidates


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output-dir", default=str(_ML_ROOT / "data" / "raw_acquired" / "grocery_store"))
    parser.add_argument("--provenance-csv", default=str(_ML_ROOT / "data" / "provenance" / "grocery_store.csv"))
    parser.add_argument("--labels", nargs="+", default=None, help="Restrict to these SmartPrep labels.")
    parser.add_argument("--max-per-class", type=int, default=None)
    args = parser.parse_args()

    print(f"Acquiring Grocery Store Dataset (KTH, MIT) into {args.output_dir}...")
    candidates = acquire(
        Path(args.output_dir),
        labels=set(args.labels) if args.labels else None,
        max_per_class=args.max_per_class,
    )
    if not candidates:
        print("\nNo candidates acquired.", file=sys.stderr)
        return
    write_candidates_csv(candidates, Path(args.provenance_csv))
    print(f"\nWrote {len(candidates)} rows to {args.provenance_csv}")


if __name__ == "__main__":
    main()

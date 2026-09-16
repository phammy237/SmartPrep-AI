"""Import first-party photos from an inbox into the canonical raw-data layout.

Usage (from the `ml/` directory):
    python scripts/import_first_party.py
    python scripts/import_first_party.py --inbox-dir data/first_party_inbox --raw-dir data/raw

## Inbox structure

```text
ml/data/first_party_inbox/
  <class>/
    fp_<class>_<specimen>_<session>_<index>.jpg
```

`<class>` must be one of `configs/classes.json`'s classes, exactly - an
unrecognized subfolder name is refused and reported, never guessed at or
silently dropped (a typo like `brocolli/` would otherwise silently lose an
entire class's photos with no error).

`<filename>`'s GROUP is derived exactly the same way as every other
first-party photo already in this workspace
(`src/datasets/manifest.py::default_group_key` - strips a trailing `_NN`
index). Following the group naming convention documented in
`data/FIRST_PARTY_COLLECTION_GUIDE.md`
(`fp_<class>_<specimen>_<session>_<index>.jpg`), every photo of the same
physical specimen in the same session naturally lands in one group with no
extra configuration - the filename convention IS the grouping mechanism, on
purpose, so nothing about grouping is invented specially for this script.

## What happens to each file

1. **Validated** (`src.curation.validation.validate_image`) - a corrupt,
   unsupported-format, or wrong-size file is REJECTED, reported, and left
   untouched in the inbox (never silently deleted or "fixed").
2. **Checked for exact duplication** (SHA-256) against every file already
   in `data/raw/<class>/` - a byte-identical duplicate is reported and
   skipped, not re-imported under a second filename (this is what stops an
   accidental double-copy into the inbox from silently inflating one
   specimen's image count).
3. **Copied** (never moved) into `data/raw/<class>/<filename>` - never
   overwrites an existing destination file of the same name. The inbox is
   left untouched either way, so it stays a safe, inspectable staging area
   and this script is always safe to re-run.

## Why no separate provenance CSV

First-party photos landing in `data/raw/<class>/` are already picked up by
the existing `src/datasets/manifest.py::candidates_from_first_party_scan`
machinery, which sets `source_dataset="first_party"` and `first_party=True`
automatically - there is nothing for this script to record that isn't
already handled by the manifest builder once files are in the canonical
location. This script's only job is the inbox -> canonical-layout move,
safely and idempotently.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

_ML_ROOT = Path(__file__).resolve().parents[1]
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from src.curation.duplicates import compute_file_hash  # noqa: E402
from src.curation.validation import validate_image  # noqa: E402
from src.datasets.manifest import IMAGE_EXTENSIONS  # noqa: E402
from src.utils.classes import ClassMap, load_class_map  # noqa: E402

DEFAULT_INBOX_DIR = _ML_ROOT / "data" / "first_party_inbox"
DEFAULT_RAW_DIR = _ML_ROOT / "data" / "raw"
DEFAULT_CLASSES_PATH = _ML_ROOT / "configs" / "classes.json"


@dataclass(frozen=True)
class ImportResult:
    imported: list[str] = field(default_factory=list)
    skipped_duplicate: list[str] = field(default_factory=list)  # exact dup of an existing raw/ file
    skipped_existing: list[str] = field(default_factory=list)  # same filename already imported before
    rejected: list[tuple[str, str]] = field(default_factory=list)  # (inbox_path, reason)


def _existing_hashes(class_raw_dir: Path) -> dict[str, str]:
    """{sha256: path} for every image already in data/raw/<class>/ - used to
    catch an inbox file that's a byte-identical duplicate of something
    already imported (possibly under a different filename)."""
    hashes: dict[str, str] = {}
    if not class_raw_dir.is_dir():
        return hashes
    for p in class_raw_dir.iterdir():
        if p.suffix.lower() in IMAGE_EXTENSIONS:
            hashes[compute_file_hash(p)] = str(p)
    return hashes


def import_class(inbox_class_dir: Path, raw_class_dir: Path) -> ImportResult:
    result = ImportResult()
    raw_class_dir.mkdir(parents=True, exist_ok=True)
    known_hashes = _existing_hashes(raw_class_dir)

    inbox_files = sorted(p for p in inbox_class_dir.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS)
    for src in inbox_files:
        dest = raw_class_dir / src.name
        if dest.exists():
            result.skipped_existing.append(str(src))
            continue

        validation = validate_image(str(src))
        if not validation.ok:
            result.rejected.append((str(src), validation.reason or "invalid"))
            continue

        file_hash = compute_file_hash(src)
        if file_hash in known_hashes:
            result.skipped_duplicate.append(str(src))
            continue

        shutil.copy2(src, dest)
        known_hashes[file_hash] = str(dest)
        result.imported.append(str(dest))

    return result


def import_first_party(inbox_dir: Path, raw_dir: Path, class_map: ClassMap) -> dict[str, ImportResult]:
    """Returns {class_name: ImportResult} for every class subfolder actually
    present in the inbox. Raises ValueError (naming the offending folder)
    if the inbox contains a subfolder that is NOT one of `class_map`'s
    classes - never silently ignored or coerced into a guessed class."""
    if not inbox_dir.is_dir():
        return {}

    inbox_subfolders = sorted(p.name for p in inbox_dir.iterdir() if p.is_dir())
    unknown = [name for name in inbox_subfolders if name not in set(class_map)]
    if unknown:
        raise ValueError(
            f"Inbox folder(s) {unknown} do not match any class in configs/classes.json "
            f"({sorted(class_map)}). Fix the folder name (likely a typo) rather than importing "
            "it under the wrong class - nothing was imported."
        )

    results: dict[str, ImportResult] = {}
    for label in inbox_subfolders:
        results[label] = import_class(inbox_dir / label, raw_dir / label)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--inbox-dir", default=str(DEFAULT_INBOX_DIR))
    parser.add_argument("--raw-dir", default=str(DEFAULT_RAW_DIR))
    parser.add_argument("--classes", default=str(DEFAULT_CLASSES_PATH))
    args = parser.parse_args()

    class_map = load_class_map(args.classes)
    inbox_dir = Path(args.inbox_dir)
    raw_dir = Path(args.raw_dir)

    if not inbox_dir.is_dir():
        print(f"No inbox directory at {inbox_dir} - nothing to import. See this script's --help for the expected layout.")
        return

    try:
        results = import_first_party(inbox_dir, raw_dir, class_map)
    except ValueError as exc:
        print(f"[abort] {exc}", file=sys.stderr)
        sys.exit(1)

    if not results:
        print(f"Inbox {inbox_dir} has no class subfolders - nothing to import.")
        return

    total_imported = 0
    for label, result in sorted(results.items()):
        total_imported += len(result.imported)
        print(f"{label}: {len(result.imported)} imported, {len(result.skipped_duplicate)} duplicate(s) skipped, "
              f"{len(result.skipped_existing)} already-imported skipped, {len(result.rejected)} rejected")
        for path, reason in result.rejected:
            print(f"  [reject] {path}: {reason}", file=sys.stderr)
        for path in result.skipped_duplicate:
            print(f"  [duplicate] {path}: byte-identical to an already-imported file", file=sys.stderr)

    print(f"\nTotal newly imported: {total_imported}")
    if total_imported:
        print("Run scripts/audit_dataset.py (or make_manifest.py) to see updated per-class/group counts.")


if __name__ == "__main__":
    main()

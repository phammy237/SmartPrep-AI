"""Acquire potato/onion/tomato from the official Mendeley ZIP archive.

Source (verified current, official): Mendeley Data, DOI `10.17632/b9rvg4f2st.4`
  "Vegetable Image Dataset for Classification Models: A Bangladeshi Perspective"
  Authors: Md Jobayer Ahmed, Ratu Saha, Arpon Kishore Dutta, Mayen Uddin Mojumdar.
License: CC BY 4.0.

Unlike BanglaVegNet (see `banglavegnet.py` - dormant/deferred, blocked on a
manual folder-id lookup), this dataset is published as ONE official ZIP file
(`Vegetable_Image.zip`, ~2.0GB, confirmed via Mendeley's file-listing API:
a single file entry, not paginated file-by-file) fetched through Mendeley's
own stable per-file download endpoint (which 302-redirects to the actual
S3 object - both confirmed reachable anonymously, no credentials).

## Why this script does NOT download the whole 2GB archive

We only want 3 of its 12 classes (potato, onion, tomato - 1,051 images,
~428MB of the 2GB total). The S3 object serves `Accept-Ranges: bytes`
(confirmed), so this script:
  1. Fetches the ZIP's central directory via a handful of small HTTP Range
     requests (~540KB total - `zipfile.ZipFile` reading from a minimal
     seekable-over-HTTP file object), giving every entry's name, compressed
     size, CRC32, and exact byte offset - all without downloading image
     data.
  2. Verified directly (not assumed): each target class's entries occupy
     one CONTIGUOUS byte span in the archive (potato/onion/tomato each
     print as `sorted_contiguous=True` when checked against `header_offset`
     ordering). So each class is fetched with exactly ONE HTTP Range GET
     covering its whole span (~140-150MB each), not one request per file.
  3. Each file inside that span is then extracted with a small, dependency-
     free local-ZIP-entry parser (`extract_entry` below) - parses the
     30-byte local file header, decompresses (raw DEFLATE via `zlib`, since
     that's this archive's only compression method), and verifies the
     result's CRC32 against the central directory's recorded value before
     ever trusting the bytes - the "checksum/size validation" this task
     asked for.

This is the official archive, unmodified, verified byte-for-byte via CRC32 -
not a re-encoding, not a guess at structure, and not a Kaggle mirror.

## Structure - verified directly, matches the published description

`Vegetable_Image/Dataset/<ClassName>/<filename>.jpg` - flat per-class
folders, no raw/processed split (unlike BanglaVegNet). Confirmed present:
Potato (365), Onion (357), Tomato (329) - exactly matching the published
per-class counts. Filenames are real camera timestamps (e.g.
`IMG_20241101_135245.jpg`), consecutive shots often ~13 seconds apart within
one class folder - consistent with burst/multi-angle photography of the
same physical specimen, though this script does NOT trust filenames for
grouping (see below).

## Grouping - same conservative approach as banglavegnet.py

This archive carries no explicit specimen/session id either. Rather than
inventing a second heuristic, this script reuses the exact same
`cluster_near_duplicates` conservative near-duplicate clustering already
built and tested for BanglaVegNet - deliberately not duplicating grouping
logic per this task's instruction.
"""

from __future__ import annotations

import argparse
import struct
import sys
import urllib.error
import urllib.request
import zipfile
import zlib
from dataclasses import dataclass
from pathlib import Path

_ML_ROOT = Path(__file__).resolve().parents[2]
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from src.curation.duplicates import cluster_near_duplicates  # noqa: E402
from src.curation.validation import validate_image  # noqa: E402
from src.datasets.manifest import CandidateImage, write_candidates_csv  # noqa: E402

DOI = "10.17632/b9rvg4f2st.4"
DATASET_TITLE = "Vegetable Image Dataset for Classification Models: A Bangladeshi Perspective"
DATASET_AUTHORS = "Md Jobayer Ahmed, Ratu Saha, Arpon Kishore Dutta, Mayen Uddin Mojumdar"
LICENSE = "CC BY 4.0"
OFFICIAL_URL = "https://data.mendeley.com/datasets/b9rvg4f2st/4"
ZIP_DOWNLOAD_URL = (
    "https://data.mendeley.com/public-files/datasets/b9rvg4f2st/files/"
    "815e9f04-3d17-4eaa-9998-c81aeabfd78f/file_downloaded"
)
ZIP_ENTRY_PREFIX = "Vegetable_Image/Dataset/"
USER_AGENT = "smartprep-ml-dataset-acquisition/0.1 (research; see ml/data/README.md)"
REQUEST_TIMEOUT_SECONDS = 60

# SmartPrep label -> the archive's own folder name for that class (kept as
# `source_label` provenance, per the same convention as banglavegnet.py -
# these three happen not to need a rename, unlike "Green Spinach"->"spinach").
CLASS_SOURCE_LABELS = {"potato": "Potato", "onion": "Onion", "tomato": "Tomato"}

NEAR_DUPLICATE_MAX_DISTANCE = 5  # same default used throughout src/curation

_LOCAL_HEADER_STRUCT = "<IHHHHHIIIHH"
_LOCAL_HEADER_SIZE = struct.calcsize(_LOCAL_HEADER_STRUCT)
_LOCAL_HEADER_SIGNATURE = 0x04034B50


class HttpRangeFile:
    """Minimal seekable file-like object over HTTP Range requests - just
    enough for `zipfile.ZipFile` to read a remote archive's central
    directory (a handful of small reads near the end of the file) without
    downloading the whole thing. NOT used for reading actual file data
    (see module docstring - that goes through one big `fetch_byte_range`
    call per class instead, for efficiency)."""

    def __init__(self, url: str):
        self.url = url
        self.pos = 0
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            self.size = int(resp.headers["Content-Length"])

    def seekable(self) -> bool:
        return True

    def seek(self, offset: int, whence: int = 0) -> int:
        if whence == 0:
            self.pos = offset
        elif whence == 1:
            self.pos += offset
        elif whence == 2:
            self.pos = self.size + offset
        return self.pos

    def tell(self) -> int:
        return self.pos

    def readable(self) -> bool:
        return True

    def writable(self) -> bool:
        return False

    def flush(self) -> None:
        pass

    def close(self) -> None:
        pass

    def read(self, n: int = -1) -> bytes:
        if n is None or n < 0:
            end = self.size - 1
        else:
            if n == 0:
                return b""
            end = min(self.pos + n, self.size) - 1
        if self.pos > end:
            return b""
        req = urllib.request.Request(
            self.url, headers={"User-Agent": USER_AGENT, "Range": f"bytes={self.pos}-{end}"}
        )
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            data = resp.read()
        self.pos += len(data)
        return data


def list_zip_entries() -> tuple[list[zipfile.ZipInfo], int]:
    """The only function that reads the archive's central directory - a few
    small Range requests via `HttpRangeFile`, never the whole 2GB file.
    Returns (entries, total_archive_size) - the latter is needed as an exact
    upper bound when a class's last entry is also the archive's last entry
    overall (see `_span_end_for_class`)."""
    f = HttpRangeFile(ZIP_DOWNLOAD_URL)
    zf = zipfile.ZipFile(f)
    return zf.infolist(), f.size


def fetch_byte_range(start: int, end_inclusive: int) -> bytes:
    """One HTTP Range GET for [start, end_inclusive] - used to fetch an
    entire class's contiguous span in a single request (see module
    docstring)."""
    req = urllib.request.Request(
        ZIP_DOWNLOAD_URL,
        headers={"User-Agent": USER_AGENT, "Range": f"bytes={start}-{end_inclusive}"},
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        return resp.read()


@dataclass(frozen=True)
class ExtractedEntry:
    filename: str
    data: bytes | None
    ok: bool
    reason: str = ""


def extract_entry(span: bytes, span_start_offset: int, info: zipfile.ZipInfo) -> ExtractedEntry:
    """Pure, network-free ZIP entry extraction from an already-fetched byte
    span. Parses the local file header (fixed 30 bytes), decompresses
    (STORED or DEFLATED - this archive uses DEFLATED throughout), and
    verifies CRC32 against the central directory's recorded value before
    returning anything as `ok=True` - the checksum validation this task
    asked for. Trusts the CENTRAL directory's `compress_size` (not the
    local header's, which can legitimately be 0 when a trailing data
    descriptor is used) to find the end of the compressed data.
    """
    local_offset = info.header_offset - span_start_offset
    if local_offset < 0 or local_offset + _LOCAL_HEADER_SIZE > len(span):
        return ExtractedEntry(info.filename, None, False, "local header outside fetched span")

    sig, _ver, _flag, method, _mtime, _mdate, _crc, _csize, _usize, namelen, extralen = struct.unpack_from(
        _LOCAL_HEADER_STRUCT, span, local_offset
    )
    if sig != _LOCAL_HEADER_SIGNATURE:
        return ExtractedEntry(info.filename, None, False, "bad local file header signature")

    data_start = local_offset + _LOCAL_HEADER_SIZE + namelen + extralen
    data_end = data_start + info.compress_size
    if data_end > len(span):
        return ExtractedEntry(info.filename, None, False, "compressed data outside fetched span")

    raw = span[data_start:data_end]
    if method == zipfile.ZIP_STORED:
        payload = raw
    elif method == zipfile.ZIP_DEFLATED:
        try:
            payload = zlib.decompress(raw, -15)  # raw deflate, no zlib/gzip header
        except zlib.error as exc:
            return ExtractedEntry(info.filename, None, False, f"decompression failed: {exc}")
    else:
        return ExtractedEntry(info.filename, None, False, f"unsupported compression method {method}")

    if zlib.crc32(payload) != (info.CRC & 0xFFFFFFFF):
        return ExtractedEntry(info.filename, None, False, "CRC32 mismatch - corrupted or truncated fetch")

    return ExtractedEntry(info.filename, payload, True)


def _relative_path(path: Path) -> str:
    """See fruits360.py / banglavegnet.py's identical helper: provenance
    CSVs store paths relative to `ml/` - portable, no local username."""
    try:
        return str(path.resolve().relative_to(_ML_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def _class_entries(all_entries: list[zipfile.ZipInfo], source_label: str) -> list[zipfile.ZipInfo]:
    prefix = f"{ZIP_ENTRY_PREFIX}{source_label}/"
    return [
        e
        for e in all_entries
        if e.filename.startswith(prefix) and e.filename.lower().endswith((".jpg", ".jpeg", ".png"))
    ]


def _span_end_for_class(all_entries: list[zipfile.ZipInfo], class_entries: list[zipfile.ZipInfo], zip_size: int) -> int:
    """Exact (not padded/guessed) end offset for a class's byte span: the
    header_offset of whichever entry comes immediately after this class's
    last entry, archive-wide - a hard upper bound on where the last
    in-class entry's local header + compressed data can end. Falls back to
    the whole archive size if this class's last entry is also the
    archive's last entry overall."""
    by_offset = sorted(all_entries, key=lambda e: e.header_offset)
    last_offset = max(e.header_offset for e in class_entries)
    for i, e in enumerate(by_offset):
        if e.header_offset == last_offset:
            return by_offset[i + 1].header_offset - 1 if i + 1 < len(by_offset) else zip_size - 1
    return zip_size - 1  # unreachable in practice; safe fallback


def acquire_class(
    smartprep_label: str,
    source_label: str,
    all_entries: list[zipfile.ZipInfo],
    zip_size: int,
    output_dir: Path,
    max_images: int | None = None,
) -> list[CandidateImage]:
    class_entries = sorted(_class_entries(all_entries, source_label), key=lambda e: e.header_offset)
    if max_images is not None:
        class_entries = sorted(class_entries, key=lambda e: e.filename)[:max_images]
    if not class_entries:
        print(f"  [skip] {smartprep_label} ({source_label}): no entries found under {ZIP_ENTRY_PREFIX}{source_label}/", file=sys.stderr)
        return []

    class_dir = output_dir / smartprep_label
    class_dir.mkdir(parents=True, exist_ok=True)
    dest_for = {e.filename: class_dir / f"bangladeshi_veg_{Path(e.filename).name}" for e in class_entries}

    missing = [e for e in class_entries if not dest_for[e.filename].exists()]
    if missing:
        span_start = min(e.header_offset for e in class_entries)
        span_end = _span_end_for_class(all_entries, class_entries, zip_size)
        span = fetch_byte_range(span_start, span_end)
        for e in missing:
            dest = dest_for[e.filename]
            extracted = extract_entry(span, span_start, e)
            if not extracted.ok:
                print(f"  [reject] {e.filename}: {extracted.reason}", file=sys.stderr)
                continue
            dest.write_bytes(extracted.data)

    downloaded_paths: list[Path] = []
    for e in class_entries:
        dest = dest_for[e.filename]
        if not dest.exists():
            continue  # failed extraction above, already logged
        result = validate_image(str(dest))
        if not result.ok:
            print(f"  [reject] {dest.name}: {result.reason}", file=sys.stderr)
            dest.unlink(missing_ok=True)
            continue
        downloaded_paths.append(dest)

    if not downloaded_paths:
        print(f"  {smartprep_label} ({source_label}): 0 usable images", file=sys.stderr)
        return []

    # See banglavegnet.py's identical comment: clustering needs real
    # absolute paths to open/hash the files, but the resulting group id
    # (lexicographically-smallest member path) must be relativized before
    # it goes in the manifest, same as `path` itself.
    groups = cluster_near_duplicates([str(p) for p in downloaded_paths], max_distance=NEAR_DUPLICATE_MAX_DISTANCE)
    groups = {p: _relative_path(Path(group_id)) for p, group_id in groups.items()}
    candidates = [
        CandidateImage(
            path=_relative_path(p),
            label=smartprep_label,
            group=groups[str(p)],
            source_dataset="bangladeshi_vegetables",
            source_url=OFFICIAL_URL,
            license=LICENSE,
            original_id=p.name,
            first_party=False,
            source_label=source_label,
        )
        for p in downloaded_paths
    ]
    n_groups = len({c.group for c in candidates})
    print(f"  {smartprep_label} ({source_label}): {len(candidates)} image(s) across {n_groups} group(s)")
    return candidates


def acquire(
    output_dir: Path,
    class_source_labels: dict[str, str] | None = None,
    max_images_per_class: int | None = None,
) -> list[CandidateImage]:
    class_source_labels = class_source_labels or CLASS_SOURCE_LABELS
    try:
        all_entries, zip_size = list_zip_entries()
    except (urllib.error.HTTPError, urllib.error.URLError) as exc:
        print(f"[abort] could not read the archive's central directory: {exc}", file=sys.stderr)
        return []

    candidates: list[CandidateImage] = []
    for smartprep_label, source_label in class_source_labels.items():
        candidates.extend(
            acquire_class(smartprep_label, source_label, all_entries, zip_size, output_dir, max_images_per_class)
        )
    return candidates


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output-dir", default=str(_ML_ROOT / "data" / "raw_acquired" / "bangladeshi_vegetables"))
    parser.add_argument("--provenance-csv", default=str(_ML_ROOT / "data" / "provenance" / "bangladeshi_vegetables.csv"))
    parser.add_argument("--max-images-per-class", type=int, default=None)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    print(f"Acquiring potato/onion/tomato from {DATASET_TITLE!r} ({DOI}) into {output_dir}...")
    candidates = acquire(output_dir, max_images_per_class=args.max_images_per_class)

    if not candidates:
        print("\nNo candidates acquired - see stderr above for why.", file=sys.stderr)
        return

    provenance_path = Path(args.provenance_csv)
    write_candidates_csv(candidates, provenance_path)
    print(f"\nWrote {len(candidates)} candidate rows to {provenance_path}")


if __name__ == "__main__":
    main()

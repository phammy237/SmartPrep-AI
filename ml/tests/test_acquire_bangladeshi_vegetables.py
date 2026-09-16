"""Unit tests for scripts/acquire/bangladeshi_vegetables.py - no network.

`extract_entry` / `_class_entries` / `_span_end_for_class` are pure and
tested directly against a real in-memory ZIP archive built with the
standard library's own `zipfile` module (so the fixture data is a genuine,
correctly-formed ZIP - not a hand-rolled approximation). `list_zip_entries`
and `fetch_byte_range` (the only two functions that touch the network) are
monkeypatched for the higher-level `acquire()`/`acquire_class()` tests.
"""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.acquire import bangladeshi_vegetables as bv
from src.curation.leakage import audit_manifest_leakage
from src.datasets.manifest import assign_splits
from src.training.config import SplitConfig
from tests.conftest import make_tiny_image_bytes


def _make_jpeg_bytes(color, size=32, seed=0) -> bytes:
    # size=32 (not conftest's 16 default): validate_image's MIN_DIMENSION
    # is 32, and these tests exercise real validation.
    return make_tiny_image_bytes(color, size=size, seed=seed, format="JPEG")


def _build_archive(entries: dict[str, bytes]) -> tuple[bytes, list[zipfile.ZipInfo]]:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    raw = buf.getvalue()
    infos = zipfile.ZipFile(io.BytesIO(raw)).infolist()
    return raw, infos


def _info_for(infos: list[zipfile.ZipInfo], filename: str) -> zipfile.ZipInfo:
    return next(i for i in infos if i.filename == filename)


# --- extract_entry -----------------------------------------------------


def test_extract_entry_recovers_original_bytes():
    original = _make_jpeg_bytes((200, 30, 30), seed=1)
    raw, infos = _build_archive({"Vegetable_Image/Dataset/Potato/img1.jpg": original})
    info = _info_for(infos, "Vegetable_Image/Dataset/Potato/img1.jpg")

    result = bv.extract_entry(raw, 0, info)
    assert result.ok
    assert result.data == original


def test_extract_entry_works_at_a_nonzero_span_offset():
    """Simulates fetching a byte RANGE that does not start at byte 0 of the
    archive (the real acquisition path: a class's span starts partway
    through the whole 2GB file)."""
    original = _make_jpeg_bytes((30, 200, 30), seed=2)
    padding = b"\x00" * 1000  # stands in for earlier classes' data
    raw, infos = _build_archive({"Vegetable_Image/Dataset/Onion/img1.jpg": original})
    info = _info_for(infos, "Vegetable_Image/Dataset/Onion/img1.jpg")

    padded = padding + raw
    # `padded` represents absolute bytes [0, len(padded)) of a hypothetical
    # larger archive, so span_start_offset is 0 - but the entry's own
    # header_offset must be shifted to its new absolute position within
    # that hypothetical larger archive (ZipInfo is a plain mutable object,
    # not frozen - safe to adjust directly).
    info.header_offset += len(padding)

    result = bv.extract_entry(padded, 0, info)
    assert result.ok
    assert result.data == original


def test_extract_entry_rejects_span_too_short_for_local_header():
    original = _make_jpeg_bytes((10, 10, 200), seed=3)
    raw, infos = _build_archive({"Vegetable_Image/Dataset/Tomato/img1.jpg": original})
    info = _info_for(infos, "Vegetable_Image/Dataset/Tomato/img1.jpg")

    truncated = raw[:5]  # far too short to even contain the local header
    result = bv.extract_entry(truncated, 0, info)
    assert not result.ok
    assert "outside fetched span" in result.reason


def test_extract_entry_detects_corrupted_data_via_crc_mismatch():
    original = _make_jpeg_bytes((90, 90, 90), seed=4)
    raw, infos = _build_archive({"Vegetable_Image/Dataset/Potato/img1.jpg": original})
    info = _info_for(infos, "Vegetable_Image/Dataset/Potato/img1.jpg")

    # Corrupt a byte squarely inside THIS entry's compressed-data region -
    # not just anywhere in `raw` (the tail of a single-entry zip is its
    # central directory + EOCD, which extract_entry never reads, so
    # corrupting there would prove nothing).
    namelen = len(info.filename.encode("utf-8"))
    data_start = bv._LOCAL_HEADER_SIZE + namelen  # extra field is empty here
    data_mid = data_start + info.compress_size // 2
    corrupted = bytearray(raw)
    corrupted[data_mid] ^= 0xFF
    result = bv.extract_entry(bytes(corrupted), 0, info)
    assert not result.ok  # either CRC mismatch or a decompression error - both are "not ok"


# --- _class_entries / _span_end_for_class -------------------------------


def test_class_entries_filters_to_one_class_only():
    raw, infos = _build_archive(
        {
            "Vegetable_Image/Dataset/Potato/a.jpg": _make_jpeg_bytes((200, 0, 0), seed=1),
            "Vegetable_Image/Dataset/Potato/b.jpg": _make_jpeg_bytes((200, 0, 0), seed=2),
            "Vegetable_Image/Dataset/Onion/a.jpg": _make_jpeg_bytes((0, 200, 0), seed=3),
            "Vegetable_Image/Dataset/Bean/a.jpg": _make_jpeg_bytes((0, 0, 200), seed=4),  # not a target class
        }
    )
    potato_entries = bv._class_entries(infos, "Potato")
    assert {e.filename for e in potato_entries} == {
        "Vegetable_Image/Dataset/Potato/a.jpg",
        "Vegetable_Image/Dataset/Potato/b.jpg",
    }


def test_span_end_for_class_uses_next_entrys_offset():
    raw, infos = _build_archive(
        {
            "Vegetable_Image/Dataset/Potato/a.jpg": _make_jpeg_bytes((200, 0, 0), seed=1),
            "Vegetable_Image/Dataset/Onion/a.jpg": _make_jpeg_bytes((0, 200, 0), seed=2),
        }
    )
    potato_entries = bv._class_entries(infos, "Potato")
    onion_info = _info_for(infos, "Vegetable_Image/Dataset/Onion/a.jpg")

    end = bv._span_end_for_class(infos, potato_entries, len(raw))
    assert end == onion_info.header_offset - 1


def test_span_end_for_class_falls_back_to_archive_size_when_last_overall():
    raw, infos = _build_archive(
        {
            "Vegetable_Image/Dataset/Onion/a.jpg": _make_jpeg_bytes((0, 200, 0), seed=1),
            "Vegetable_Image/Dataset/Tomato/a.jpg": _make_jpeg_bytes((200, 200, 0), seed=2),
        }
    )
    tomato_entries = bv._class_entries(infos, "Tomato")
    end = bv._span_end_for_class(infos, tomato_entries, len(raw))
    assert end == len(raw) - 1


# --- acquire() / acquire_class() - network functions monkeypatched ------


def test_acquire_only_extracts_the_three_target_classes(tmp_path, monkeypatch):
    raw, infos = _build_archive(
        {
            "Vegetable_Image/Dataset/Potato/a.jpg": _make_jpeg_bytes((200, 0, 0), seed=1),
            "Vegetable_Image/Dataset/Onion/a.jpg": _make_jpeg_bytes((0, 200, 0), seed=2),
            "Vegetable_Image/Dataset/Tomato/a.jpg": _make_jpeg_bytes((0, 0, 200), seed=3),
            "Vegetable_Image/Dataset/Bean/a.jpg": _make_jpeg_bytes((100, 100, 0), seed=4),
            "Vegetable_Image/Dataset/Garlic/a.jpg": _make_jpeg_bytes((100, 0, 100), seed=5),
        }
    )
    monkeypatch.setattr(bv, "list_zip_entries", lambda: (infos, len(raw)))
    monkeypatch.setattr(bv, "fetch_byte_range", lambda start, end: raw[start : end + 1])

    candidates = bv.acquire(tmp_path)
    assert {c.label for c in candidates} == {"potato", "onion", "tomato"}
    assert len(candidates) == 3


def test_provenance_retains_source_label_and_dataset_metadata(tmp_path, monkeypatch):
    raw, infos = _build_archive({"Vegetable_Image/Dataset/Potato/a.jpg": _make_jpeg_bytes((200, 0, 0), seed=1)})
    monkeypatch.setattr(bv, "list_zip_entries", lambda: (infos, len(raw)))
    monkeypatch.setattr(bv, "fetch_byte_range", lambda start, end: raw[start : end + 1])

    candidates = bv.acquire(tmp_path, class_source_labels={"potato": "Potato"})
    assert len(candidates) == 1
    c = candidates[0]
    assert c.label == "potato"
    assert c.source_label == "Potato"
    assert c.source_dataset == "bangladeshi_vegetables"
    assert c.license == "CC BY 4.0"
    assert c.first_party is False


def test_acquisition_is_idempotent_and_never_refetches_when_all_files_present(tmp_path, monkeypatch):
    raw, infos = _build_archive({"Vegetable_Image/Dataset/Onion/a.jpg": _make_jpeg_bytes((0, 200, 0), seed=1)})

    fetch_calls = []

    def fake_fetch(start, end):
        fetch_calls.append((start, end))
        return raw[start : end + 1]

    monkeypatch.setattr(bv, "list_zip_entries", lambda: (infos, len(raw)))
    monkeypatch.setattr(bv, "fetch_byte_range", fake_fetch)

    bv.acquire(tmp_path, class_source_labels={"onion": "Onion"})
    assert len(fetch_calls) == 1

    candidates = bv.acquire(tmp_path, class_source_labels={"onion": "Onion"})
    assert len(fetch_calls) == 1  # second run: nothing missing, no re-fetch
    assert len(candidates) == 1  # still reported as a valid candidate


def test_grouping_clusters_near_duplicate_images_together(tmp_path, monkeypatch):
    raw, infos = _build_archive(
        {
            "Vegetable_Image/Dataset/Tomato/a.jpg": _make_jpeg_bytes((200, 30, 30), seed=1),
            "Vegetable_Image/Dataset/Tomato/b.jpg": _make_jpeg_bytes((202, 28, 32), seed=1),  # near-identical to a
            "Vegetable_Image/Dataset/Tomato/c.jpg": _make_jpeg_bytes((30, 30, 200), seed=2),  # distinct
        }
    )
    monkeypatch.setattr(bv, "list_zip_entries", lambda: (infos, len(raw)))
    monkeypatch.setattr(bv, "fetch_byte_range", lambda start, end: raw[start : end + 1])

    candidates = bv.acquire(tmp_path, class_source_labels={"tomato": "Tomato"})
    assert len(candidates) == 3
    by_name = {Path(c.path).name: c for c in candidates}
    ga = by_name["bangladeshi_veg_a.jpg"].group
    gb = by_name["bangladeshi_veg_b.jpg"].group
    gc = by_name["bangladeshi_veg_c.jpg"].group
    assert ga == gb
    assert gc != ga


def test_no_cross_split_group_leakage(tmp_path, monkeypatch):
    entries = {}
    specimen_colors = [(200, 30, 30), (30, 200, 30), (30, 30, 200), (200, 200, 30)]
    for specimen in range(4):
        for shot in range(3):
            entries[f"Vegetable_Image/Dataset/Onion/s{specimen}_{shot}.jpg"] = _make_jpeg_bytes(
                specimen_colors[specimen], seed=specimen
            )
    raw, infos = _build_archive(entries)
    monkeypatch.setattr(bv, "list_zip_entries", lambda: (infos, len(raw)))
    monkeypatch.setattr(bv, "fetch_byte_range", lambda start, end: raw[start : end + 1])

    candidates = bv.acquire(tmp_path, class_source_labels={"onion": "Onion"})
    assert len(candidates) == 12
    assert len({c.group for c in candidates}) == 4

    rows = assign_splits(candidates, SplitConfig(0.5, 0.25, 0.25), seed=7)
    report = audit_manifest_leakage(rows)
    assert report["group_split_violations"] == {}
    assert report["cross_split_exact_duplicates"] == []
    assert report["cross_split_near_duplicates"] == []


def test_acquire_handles_missing_class_gracefully(tmp_path, monkeypatch):
    """A configured class with no matching entries in the archive must be
    skipped, not raise."""
    raw, infos = _build_archive({"Vegetable_Image/Dataset/Onion/a.jpg": _make_jpeg_bytes((0, 200, 0), seed=1)})
    monkeypatch.setattr(bv, "list_zip_entries", lambda: (infos, len(raw)))
    monkeypatch.setattr(bv, "fetch_byte_range", lambda start, end: raw[start : end + 1])

    candidates = bv.acquire(tmp_path, class_source_labels={"potato": "Potato", "onion": "Onion"})
    assert {c.label for c in candidates} == {"onion"}

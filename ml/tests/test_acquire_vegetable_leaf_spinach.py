"""Unit tests for scripts/acquire/vegetable_leaf_spinach.py - no network.

`download_zip_bytes` (the only network-touching function) is monkeypatched
with a real, small in-memory ZIP built via the standard `zipfile` module.
"""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.acquire import vegetable_leaf_spinach as vls
from tests.conftest import make_tiny_image_bytes


def _make_jpeg_bytes(color, size=32, seed=0) -> bytes:
    # size=32 (not conftest's 16 default): validate_image's MIN_DIMENSION
    # is 32, and these tests exercise real validation.
    return make_tiny_image_bytes(color, size=size, seed=seed, format="JPEG")


def _build_zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_acquire_extracts_only_the_spinach_folder(tmp_path, monkeypatch):
    zip_bytes = _build_zip(
        {
            "Root/spinach/a.jpg": _make_jpeg_bytes((0, 150, 0), seed=1),
            "Root/spinach/b.jpg": _make_jpeg_bytes((0, 160, 10), seed=2),
            "Root/cabbage/a.jpg": _make_jpeg_bytes((100, 200, 100), seed=3),  # not our class
            "Root/lettuce/a.jpg": _make_jpeg_bytes((50, 180, 50), seed=4),  # not our class
        }
    )
    monkeypatch.setattr(vls, "download_zip_bytes", lambda: zip_bytes)

    candidates = vls.acquire(tmp_path)
    assert len(candidates) == 2
    assert all(c.label == "spinach" for c in candidates)
    assert all(c.source_label == "spinach" for c in candidates)
    assert all(c.source_dataset == "vegetable_leaf_spinach" for c in candidates)
    assert all(c.license == "CC BY 4.0" for c in candidates)
    assert all(c.first_party is False for c in candidates)


def test_acquisition_is_idempotent(tmp_path, monkeypatch):
    zip_bytes = _build_zip({"Root/spinach/a.jpg": _make_jpeg_bytes((0, 150, 0), seed=1)})
    call_count = {"n": 0}

    def fake_download():
        call_count["n"] += 1
        return zip_bytes

    monkeypatch.setattr(vls, "download_zip_bytes", fake_download)

    first = vls.acquire(tmp_path)
    second = vls.acquire(tmp_path)
    assert len(first) == 1
    assert len(second) == 1
    # both runs fetch the zip (it's small enough that re-downloading the
    # whole archive is acceptable - see module docstring), but the SECOND
    # run must never overwrite the already-extracted file on disk.
    dest = tmp_path / "spinach" / "veg_leaf_a.jpg"
    mtime_after_first = dest.stat().st_mtime_ns
    vls.acquire(tmp_path)
    assert dest.stat().st_mtime_ns == mtime_after_first


def test_grouping_clusters_near_duplicates(tmp_path, monkeypatch):
    zip_bytes = _build_zip(
        {
            "Root/spinach/a.jpg": _make_jpeg_bytes((120, 120, 120), seed=1),
            "Root/spinach/b.jpg": _make_jpeg_bytes((122, 118, 121), seed=1),  # near-identical to a
            "Root/spinach/c.jpg": _make_jpeg_bytes((10, 200, 30), seed=2),  # distinct
        }
    )
    monkeypatch.setattr(vls, "download_zip_bytes", lambda: zip_bytes)

    candidates = vls.acquire(tmp_path)
    by_name = {Path(c.path).name: c for c in candidates}
    assert by_name["veg_leaf_a.jpg"].group == by_name["veg_leaf_b.jpg"].group
    assert by_name["veg_leaf_c.jpg"].group != by_name["veg_leaf_a.jpg"].group


def test_rejects_corrupt_entries_without_raising(tmp_path, monkeypatch):
    zip_bytes = _build_zip(
        {
            "Root/spinach/good.jpg": _make_jpeg_bytes((0, 150, 0), seed=1),
            "Root/spinach/bad.jpg": b"not a real image",
        }
    )
    monkeypatch.setattr(vls, "download_zip_bytes", lambda: zip_bytes)

    candidates = vls.acquire(tmp_path)
    assert len(candidates) == 1
    assert candidates[0].original_id == "veg_leaf_good.jpg"

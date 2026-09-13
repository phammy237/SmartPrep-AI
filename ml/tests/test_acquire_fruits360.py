"""Unit tests for scripts/acquire/fruits360.py's pure logic - no network.

`list_variety_files` and `download_file` (the only two functions that touch
the network) are monkeypatched; everything else (grouping, filename
construction, validation-based rejection, idempotent skip-if-exists) is
exercised for real against a tmp_path.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.acquire import fruits360


def _fake_listing(names: list[str]) -> list[dict]:
    return [
        {"type": "file", "name": name, "download_url": f"https://example.com/{name}"}
        for name in names
    ]


def test_acquire_downloads_and_groups_by_variety(tmp_path, monkeypatch):
    monkeypatch.setattr(fruits360, "list_variety_files", lambda variety: _fake_listing(["0_100.jpg", "1_100.jpg"]))

    def fake_download(url, dest):
        from PIL import Image

        Image.new("RGB", (64, 64), (200, 30, 30)).save(dest)

    monkeypatch.setattr(fruits360, "download_file", fake_download)

    candidates = fruits360.acquire(
        tmp_path, max_per_variety=5, class_varieties={"apple": ["Apple Golden 1"]}
    )

    assert len(candidates) == 2
    assert {c.group for c in candidates} == {"fruits360:apple:Apple Golden 1"}
    assert all(c.label == "apple" for c in candidates)
    assert all(c.source_dataset == "fruits360" for c in candidates)
    assert all(c.license == "CC BY-SA 4.0" for c in candidates)
    assert all(c.first_party is False for c in candidates)
    assert all(Path(c.path).exists() for c in candidates)


def test_acquire_respects_max_per_variety(tmp_path, monkeypatch):
    monkeypatch.setattr(
        fruits360, "list_variety_files", lambda variety: _fake_listing([f"{i}_100.jpg" for i in range(20)])
    )

    def fake_download(url, dest):
        from PIL import Image

        Image.new("RGB", (64, 64), (200, 30, 30)).save(dest)

    monkeypatch.setattr(fruits360, "download_file", fake_download)

    candidates = fruits360.acquire(tmp_path, max_per_variety=3, class_varieties={"apple": ["Apple Golden 1"]})
    assert len(candidates) == 3


def test_acquire_is_idempotent_and_never_redownloads_existing_file(tmp_path, monkeypatch):
    monkeypatch.setattr(fruits360, "list_variety_files", lambda variety: _fake_listing(["0_100.jpg"]))

    download_calls = []

    def fake_download(url, dest):
        from PIL import Image

        download_calls.append(dest)
        Image.new("RGB", (64, 64), (200, 30, 30)).save(dest)

    monkeypatch.setattr(fruits360, "download_file", fake_download)

    fruits360.acquire(tmp_path, max_per_variety=5, class_varieties={"apple": ["Apple Golden 1"]})
    assert len(download_calls) == 1

    # Second run: file already exists on disk - must not be re-downloaded.
    candidates = fruits360.acquire(tmp_path, max_per_variety=5, class_varieties={"apple": ["Apple Golden 1"]})
    assert len(download_calls) == 1  # still just the one call from before
    assert len(candidates) == 1  # still shows up as a valid candidate


def test_acquire_rejects_and_removes_invalid_downloaded_images(tmp_path, monkeypatch):
    monkeypatch.setattr(fruits360, "list_variety_files", lambda variety: _fake_listing(["corrupt.jpg"]))

    def fake_download(url, dest):
        dest.write_bytes(b"not a real image")

    monkeypatch.setattr(fruits360, "download_file", fake_download)

    candidates = fruits360.acquire(tmp_path, max_per_variety=5, class_varieties={"apple": ["Apple Golden 1"]})
    assert candidates == []
    # the corrupt file must not be left behind for a later manifest scan to trip over
    assert not any((tmp_path / "apple").glob("*"))


def test_acquire_handles_listing_failure_without_raising(tmp_path, monkeypatch):
    import urllib.error

    def raise_http_error(variety):
        raise urllib.error.HTTPError(url="u", code=404, msg="not found", hdrs=None, fp=None)

    monkeypatch.setattr(fruits360, "list_variety_files", raise_http_error)
    candidates = fruits360.acquire(tmp_path, max_per_variety=5, class_varieties={"apple": ["Missing Variety"]})
    assert candidates == []

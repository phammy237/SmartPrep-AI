"""Unit tests for scripts/acquire/banglavegnet.py's pure logic - no network.

`list_folder_files` and `download_file` (the only two functions that touch
the network) are monkeypatched throughout.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.acquire import banglavegnet
from src.datasets.manifest import assign_splits
from src.curation.leakage import audit_manifest_leakage
from src.training.config import SplitConfig
from tests.conftest import _make_tiny_image


def _fake_listing(names: list[str], size: int = 4_000_000) -> list[dict]:
    return [
        {
            "filename": name,
            "id": f"file-{name}",
            "content_details": {"download_url": f"https://example.com/{name}", "size": size},
            "size": size,
        }
        for name in names
    ]


def _make_image(dest, color, seed=0, size=32):
    # size=32 (not conftest's 16 default): validate_image's MIN_DIMENSION
    # is 32, and these tests exercise real validation. Format (JPEG) is
    # inferred from `dest`'s .jpg suffix, same as every other first-party
    # image conftest's `_make_tiny_image` writes.
    _make_tiny_image(dest, color, size=size, seed=seed)


DATASET_META = {
    "title": "A Comprehensive Image Dataset of Vegetables Grown in Bangladesh",
    "doi": "10.17632/rtx9ngb68j.2",
    "version": 2,
    "license": "CC BY 4.0",
    "official_url": "https://data.mendeley.com/datasets/rtx9ngb68j/2",
}


def _config(classes: dict) -> dict:
    return {"dataset": DATASET_META, "classes": classes}


def test_source_label_to_smartprep_label_mapping(tmp_path, monkeypatch):
    """Green Spinach -> spinach: the exact rename the task calls out."""
    monkeypatch.setattr(banglavegnet, "list_folder_files", lambda folder_id: _fake_listing(["Green_Spinach_0001.jpg"]))

    def fake_download(url, dest):
        _make_image(dest, (0, 150, 0), seed=1)

    monkeypatch.setattr(banglavegnet, "download_file", fake_download)

    config = _config({"spinach": {"source_label": "Green Spinach", "folder_id_raw": "folder-abc"}})
    candidates = banglavegnet.acquire(tmp_path, config)

    assert len(candidates) == 1
    assert candidates[0].label == "spinach"
    assert candidates[0].source_label == "Green Spinach"


def test_provenance_retains_original_label_even_when_identical(tmp_path, monkeypatch):
    monkeypatch.setattr(banglavegnet, "list_folder_files", lambda folder_id: _fake_listing(["Broccoli_0001.jpg"]))
    monkeypatch.setattr(banglavegnet, "download_file", lambda url, dest: _make_image(dest, (0, 100, 0), seed=1))

    config = _config({"broccoli": {"source_label": "Broccoli", "folder_id_raw": "folder-xyz"}})
    candidates = banglavegnet.acquire(tmp_path, config)

    assert candidates[0].source_label == "Broccoli"
    assert candidates[0].source_dataset == "banglavegnet"
    assert candidates[0].license == "CC BY 4.0"
    assert candidates[0].first_party is False


def test_unconfigured_classes_are_skipped_not_guessed(tmp_path, monkeypatch):
    """A class with folder_id_raw still null/missing must never be silently
    acquired from a guessed folder - it should simply not appear."""
    monkeypatch.setattr(banglavegnet, "list_folder_files", lambda folder_id: _fake_listing(["Tomato_0001.jpg"]))
    monkeypatch.setattr(banglavegnet, "download_file", lambda url, dest: _make_image(dest, (200, 30, 30), seed=1))

    config = _config(
        {
            "tomato": {"source_label": "Tomato", "folder_id_raw": "folder-configured"},
            "onion": {"source_label": "Onion", "folder_id_raw": None},
            "potato": {"source_label": "Potato", "folder_id_raw": ""},
        }
    )
    candidates = banglavegnet.acquire(tmp_path, config)
    assert {c.label for c in candidates} == {"tomato"}


def test_acquisition_is_idempotent_and_never_redownloads_existing_file(tmp_path, monkeypatch):
    monkeypatch.setattr(banglavegnet, "list_folder_files", lambda folder_id: _fake_listing(["Onion_0001.jpg"]))

    download_calls = []

    def fake_download(url, dest):
        download_calls.append(dest)
        _make_image(dest, (200, 200, 150), seed=1)

    monkeypatch.setattr(banglavegnet, "download_file", fake_download)

    config = _config({"onion": {"source_label": "Onion", "folder_id_raw": "folder-onion"}})
    banglavegnet.acquire(tmp_path, config)
    assert len(download_calls) == 1

    candidates = banglavegnet.acquire(tmp_path, config)
    assert len(download_calls) == 1  # unchanged - no re-download
    assert len(candidates) == 1  # still a valid candidate on the second run


def test_raw_vs_processed_filtering_aborts_on_small_average_file_size(tmp_path, monkeypatch):
    """If a configured folder_id turns out to hold small (~processed) files
    rather than raw originals, the script must refuse that class rather than
    silently acquiring the wrong subset."""
    monkeypatch.setattr(
        banglavegnet, "list_folder_files", lambda folder_id: _fake_listing(["Potato_0001.jpg"], size=13_000)
    )
    download_calls = []
    monkeypatch.setattr(banglavegnet, "download_file", lambda url, dest: download_calls.append(dest))

    config = _config({"potato": {"source_label": "Potato", "folder_id_raw": "folder-processed-by-mistake"}})
    candidates = banglavegnet.acquire(tmp_path, config)

    assert candidates == []
    assert download_calls == []  # aborted before ever downloading anything


def test_grouping_clusters_near_duplicate_images_together(tmp_path, monkeypatch):
    """Two near-identical photos (same specimen, slightly different shot)
    must land in the same group; a visually distinct one gets its own."""
    monkeypatch.setattr(
        banglavegnet,
        "list_folder_files",
        lambda folder_id: _fake_listing(["Tomato_0001.jpg", "Tomato_0002.jpg", "Tomato_0003.jpg"]),
    )

    images = {
        "Tomato_0001.jpg": ((200, 30, 30), 1),
        "Tomato_0002.jpg": ((202, 28, 32), 1),  # near-identical to 0001 (same seed, tiny color shift)
        "Tomato_0003.jpg": ((30, 30, 200), 2),  # visually distinct
    }

    def fake_download(url, dest):
        color, seed = images[dest.name.replace("banglavegnet_", "")]
        _make_image(dest, color, seed=seed)

    monkeypatch.setattr(banglavegnet, "download_file", fake_download)

    config = _config({"tomato": {"source_label": "Tomato", "folder_id_raw": "folder-tomato"}})
    candidates = banglavegnet.acquire(tmp_path, config)
    assert len(candidates) == 3

    by_name = {Path(c.path).name: c for c in candidates}
    g1 = by_name["banglavegnet_Tomato_0001.jpg"].group
    g2 = by_name["banglavegnet_Tomato_0002.jpg"].group
    g3 = by_name["banglavegnet_Tomato_0003.jpg"].group
    assert g1 == g2
    assert g3 != g1


def test_no_cross_split_group_leakage_for_banglavegnet_shaped_candidates(tmp_path, monkeypatch):
    """End-to-end: acquire -> assign_splits -> audit_manifest_leakage must
    come back clean even though BanglaVegNet's groups come from near-dup
    clustering rather than folder metadata (unlike Fruits-360)."""
    monkeypatch.setattr(
        banglavegnet,
        "list_folder_files",
        lambda folder_id: _fake_listing([f"Onion_{i:04d}.jpg" for i in range(1, 13)]),
    )

    # 4 distinct "specimens" (visually different base colors), 3 near-dup
    # shots each - the realistic shape this source actually produces.
    specimen_colors = [(200, 30, 30), (30, 200, 30), (30, 30, 200), (200, 200, 30)]

    def fake_download(url, dest):
        # Tomato_0001..0003 -> specimen 0, 0004..0006 -> specimen 1, etc.
        index = int(dest.name.rsplit("_", 1)[-1].split(".")[0]) - 1
        specimen = index // 3
        _make_image(dest, specimen_colors[specimen], seed=specimen)  # same seed within a specimen

    monkeypatch.setattr(banglavegnet, "download_file", fake_download)

    config = _config({"onion": {"source_label": "Onion", "folder_id_raw": "folder-onion"}})
    candidates = banglavegnet.acquire(tmp_path, config)
    assert len(candidates) == 12
    assert len({c.group for c in candidates}) == 4  # 4 specimens, not 12 singleton groups

    rows = assign_splits(candidates, SplitConfig(0.5, 0.25, 0.25), seed=7)
    report = audit_manifest_leakage(rows)
    assert report["group_split_violations"] == {}
    assert report["cross_split_exact_duplicates"] == []
    assert report["cross_split_near_duplicates"] == []

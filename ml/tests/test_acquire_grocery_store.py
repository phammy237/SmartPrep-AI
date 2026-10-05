"""Unit tests for scripts/acquire/grocery_store.py - no network."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.acquire import grocery_store as gs
from tests.conftest import make_tiny_image_bytes

PATHS = [
    "README.md",
    "dataset/classes.csv",
    "dataset/train/Fruit/Apple/Golden-Delicious/Golden-Delicious_001.jpg",
    "dataset/val/Fruit/Apple/Golden-Delicious/Golden-Delicious_002.jpg",
    "dataset/train/Fruit/Apple/Granny-Smith/Granny-Smith_001.jpg",
    "dataset/train/Packages/Juice/Bravo-Apple-Juice/x_001.jpg",  # not a mapped class
    "dataset/train/Vegetables/Mushroom/Portobello/p_001.jpg",
    "dataset/train/Vegetables/Brown-Cap-Mushroom/Brown/b_001.jpg",  # merges into mushroom
    "dataset/iconic-images-and-descriptions/Fruit/Apple/x.jpg",  # wrong depth
]


def test_parse_entries_maps_classes_and_skips_the_rest():
    entries = gs.parse_entries(PATHS)
    labels = sorted(e["label"] for e in entries)
    assert labels == ["apple", "apple", "apple", "mushroom", "mushroom"]
    assert all(e["path"].startswith("dataset/") for e in entries)


def test_parse_entries_accepts_flat_classes_without_a_variety_folder():
    entries = gs.parse_entries(["dataset/train/Fruit/Banana/Banana_001.jpg", "dataset/val/Fruit/Banana/Banana_002.jpg"])
    assert [(e["label"], e["variety"], e["filename"]) for e in entries] == [
        ("banana", "", "Banana_001.jpg"),
        ("banana", "", "Banana_002.jpg"),
    ]


def test_flat_classes_get_cluster_groups(tmp_path):
    paths = [f"dataset/train/Fruit/Banana/Banana_{i:03d}.jpg" for i in range(3)]

    def fake_download(path, dest):
        dest.write_bytes(make_tiny_image_bytes((220, 200, 0), size=32, seed=3, format="JPEG"))
        return True

    candidates = gs.acquire(tmp_path, list_paths=lambda: paths, download=fake_download)
    assert len(candidates) == 3
    assert all(c.group.startswith("grocery_store_kth:Banana:cluster:") for c in candidates)


def test_acquire_groups_by_variety_and_ignores_kth_split(tmp_path):
    def fake_download(path, dest):
        dest.write_bytes(make_tiny_image_bytes((200, 0, 0), size=32, seed=1, format="JPEG"))
        return "Granny" not in path  # one failed download is dropped, not fatal

    candidates = gs.acquire(tmp_path, list_paths=lambda: PATHS, download=fake_download)
    apples = [c for c in candidates if c.label == "apple"]
    assert len(apples) == 2  # both Golden-Delicious (train + val folders), Granny failed
    assert {c.group for c in apples} == {"grocery_store_kth:Apple:Golden-Delicious"}  # same group despite KTH train/val
    assert all(c.license == "MIT" and c.source_dataset == "grocery_store_kth" and not c.first_party for c in candidates)
    assert {c.label for c in candidates} == {"apple", "mushroom"}


def test_acquire_respects_label_filter_and_cap(tmp_path):
    def fake_download(path, dest):
        dest.write_bytes(make_tiny_image_bytes((0, 200, 0), size=32, seed=2, format="JPEG"))
        return True

    candidates = gs.acquire(tmp_path, labels={"apple"}, max_per_class=1, list_paths=lambda: PATHS, download=fake_download)
    assert len(candidates) == 1 and candidates[0].label == "apple"

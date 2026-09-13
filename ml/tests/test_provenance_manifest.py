"""Provenance manifest: CandidateImage/ManifestRow round-tripping, and merging
first-party + acquired-with-provenance sources into one leakage-free manifest.
"""

from __future__ import annotations

import pytest

from src.datasets.manifest import (
    CandidateImage,
    ManifestRow,
    build_combined_manifest_rows,
    read_candidates_csv,
    read_manifest,
    write_candidates_csv,
    write_manifest,
)
from src.training.config import SplitConfig


def test_manifest_row_from_candidate_carries_every_provenance_field():
    candidate = CandidateImage(
        path="p", label="apple", group="g", source_dataset="fruits360",
        source_url="https://example.com/a.jpg", license="CC BY-SA 4.0", original_id="100_100.jpg",
        first_party=False,
    )
    row = ManifestRow.from_candidate(candidate, split="train")
    assert row.split == "train"
    assert row.source_dataset == "fruits360"
    assert row.source_url == "https://example.com/a.jpg"
    assert row.license == "CC BY-SA 4.0"
    assert row.original_id == "100_100.jpg"
    assert row.first_party is False


def test_first_party_candidate_defaults():
    candidate = CandidateImage(path="p", label="apple", group="g")
    assert candidate.source_dataset == "first_party"
    assert candidate.first_party is True


def test_write_and_read_candidates_csv_round_trips(tmp_path):
    candidates = [
        CandidateImage(path="a.jpg", label="apple", group="fruits360:apple:Variety1", source_dataset="fruits360",
                        source_url="https://example.com/a.jpg", license="CC BY-SA 4.0", original_id="a.jpg", first_party=False),
        CandidateImage(path="b.jpg", label="banana", group="fruits360:banana:Variety1", source_dataset="fruits360",
                        source_url="https://example.com/b.jpg", license="CC BY-SA 4.0", original_id="b.jpg", first_party=False),
    ]
    path = tmp_path / "provenance.csv"
    write_candidates_csv(candidates, path)
    reloaded = read_candidates_csv(path)
    assert reloaded == candidates


def test_write_and_read_manifest_round_trips_provenance(tmp_path):
    rows = [
        ManifestRow(path="a.jpg", label="apple", group="g1", split="train", source_dataset="fruits360",
                    source_url="https://example.com/a.jpg", license="CC BY-SA 4.0", original_id="a.jpg", first_party=False),
    ]
    path = tmp_path / "manifest.csv"
    write_manifest(rows, path)
    reloaded = read_manifest(path)
    assert reloaded == rows


def test_combined_manifest_merges_first_party_and_acquired(tmp_path, tiny_raw_data_dir, tiny_class_map):
    # tiny_raw_data_dir covers all 3 tiny classes already; simulate a
    # "acquired" source that ALSO covers carrot, to prove both sources feed
    # the same split assignment without error when they overlap on a class.
    provenance_path = tmp_path / "acquired.csv"
    acquired_image = tmp_path / "acquired_carrot.png"
    from PIL import Image

    Image.new("RGB", (16, 16), (200, 100, 0)).save(acquired_image)
    write_candidates_csv(
        [
            CandidateImage(
                path=str(acquired_image), label="carrot", group="fakevendor:carrot:v1",
                source_dataset="fakevendor", source_url="https://example.com/carrot.jpg",
                license="CC0", original_id="carrot.jpg", first_party=False,
            )
        ],
        provenance_path,
    )

    rows = build_combined_manifest_rows(
        tiny_class_map,
        SplitConfig(0.5, 0.25, 0.25),
        seed=1,
        data_dir=tiny_raw_data_dir,
        acquired_provenance_paths=[provenance_path],
    )
    sources = {r.source_dataset for r in rows}
    assert "first_party" in sources
    assert "fakevendor" in sources
    assert any(r.path == str(acquired_image) for r in rows)


def test_combined_manifest_raises_when_a_class_has_no_source_at_all(tmp_path, tiny_class_map):
    with pytest.raises(FileNotFoundError, match="apple.*banana.*carrot|banana.*apple.*carrot|carrot"):
        build_combined_manifest_rows(
            tiny_class_map, SplitConfig(0.5, 0.25, 0.25), seed=1, data_dir=None, acquired_provenance_paths=[]
        )


def test_combined_manifest_keeps_one_acquired_group_in_one_split(tmp_path, tiny_class_map):
    """Simulates a Fruits-360-style turntable group: many images, one group -
    they must all land in the same split."""
    provenance_path = tmp_path / "acquired.csv"
    candidates = []
    for i in range(12):
        img = tmp_path / f"frame_{i}.png"
        from PIL import Image

        Image.new("RGB", (16, 16), (100, i * 10, 50)).save(img)
        candidates.append(
            CandidateImage(
                path=str(img), label="apple", group="fruits360:apple:VarietyX",
                source_dataset="fruits360", source_url="https://example.com/x", license="CC BY-SA 4.0",
                original_id=f"frame_{i}.png", first_party=False,
            )
        )
    # Give banana/carrot their own single-image groups too, so the split has
    # more than one group per class to actually distribute.
    for label in ("banana", "carrot"):
        img = tmp_path / f"{label}.png"
        from PIL import Image

        Image.new("RGB", (16, 16), (10, 20, 30)).save(img)
        candidates.append(
            CandidateImage(path=str(img), label=label, group=f"fruits360:{label}:v1",
                            source_dataset="fruits360", source_url="u", license="CC BY-SA 4.0",
                            original_id=f"{label}.png", first_party=False)
        )
    write_candidates_csv(candidates, provenance_path)

    rows = build_combined_manifest_rows(
        tiny_class_map, SplitConfig(0.5, 0.25, 0.25), seed=1, data_dir=None,
        acquired_provenance_paths=[provenance_path],
    )
    apple_rows = [r for r in rows if r.label == "apple"]
    splits_seen = {r.split for r in apple_rows}
    assert len(splits_seen) == 1, f"the 12-frame turntable group was split across {splits_seen}"

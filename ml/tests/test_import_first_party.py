"""Unit tests for scripts/import_first_party.py - pure filesystem, no network."""

from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.import_first_party import import_class, import_first_party
from src.utils.classes import ClassMap


def _make_image(path, color, seed=0, size=32):
    from PIL import Image

    rng = random.Random(seed)
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for x in range(size):
        for y in range(size):
            noise = rng.randint(-15, 15)
            pixels[x, y] = tuple(max(0, min(255, c + noise)) for c in color)
    image.save(path)


def test_import_copies_valid_images_into_raw_dir(tmp_path):
    inbox = tmp_path / "inbox" / "milk"
    inbox.mkdir(parents=True)
    _make_image(inbox / "fp_milk_01_kitchen-night_01.jpg", (200, 200, 220), seed=1)
    _make_image(inbox / "fp_milk_01_kitchen-night_02.jpg", (200, 200, 220), seed=2)

    raw_dir = tmp_path / "raw" / "milk"
    result = import_class("milk", inbox, raw_dir)

    assert len(result.imported) == 2
    assert (raw_dir / "fp_milk_01_kitchen-night_01.jpg").exists()
    assert (raw_dir / "fp_milk_01_kitchen-night_02.jpg").exists()
    assert result.rejected == []


def test_group_is_derived_from_the_trailing_index_convention(tmp_path):
    """`fp_<class>_<specimen>_<session>_<index>.jpg` -> group is everything
    before the trailing index, via the SAME `default_group_key` used
    throughout the workspace for first-party photos - not a new mechanism."""
    from src.datasets.manifest import candidates_from_first_party_scan, default_group_key

    inbox = tmp_path / "inbox" / "egg"
    inbox.mkdir(parents=True)
    _make_image(inbox / "fp_egg_02_pantry-day1_01.jpg", (230, 220, 180), seed=1)
    _make_image(inbox / "fp_egg_02_pantry-day1_02.jpg", (230, 220, 180), seed=2)
    _make_image(inbox / "fp_egg_03_pantry-day1_01.jpg", (230, 220, 180), seed=3)

    raw_dir = tmp_path / "raw" / "egg"
    import_class("egg", inbox, raw_dir)

    class_map = ClassMap(version="test", classes=("egg",))
    candidates = candidates_from_first_party_scan(tmp_path / "raw", class_map)
    groups = {c.path: c.group for c in candidates}
    specimen_2_group = default_group_key("fp_egg_02_pantry-day1_01")
    specimen_3_group = default_group_key("fp_egg_03_pantry-day1_01")

    paths_by_name = {Path(p).name: g for p, g in groups.items()}
    assert paths_by_name["fp_egg_02_pantry-day1_01.jpg"] == specimen_2_group
    assert paths_by_name["fp_egg_02_pantry-day1_02.jpg"] == specimen_2_group
    assert paths_by_name["fp_egg_03_pantry-day1_01.jpg"] == specimen_3_group
    assert specimen_2_group != specimen_3_group


def test_import_rejects_corrupt_files_and_reports_them(tmp_path):
    inbox = tmp_path / "inbox" / "bread"
    inbox.mkdir(parents=True)
    (inbox / "bad.jpg").write_bytes(b"not a real image")
    _make_image(inbox / "good.jpg", (200, 180, 100), seed=1)

    raw_dir = tmp_path / "raw" / "bread"
    result = import_class("bread", inbox, raw_dir)

    assert len(result.imported) == 1
    assert len(result.rejected) == 1
    assert result.rejected[0][0].endswith("bad.jpg")
    assert not (raw_dir / "bad.jpg").exists()  # never copied
    assert (inbox / "bad.jpg").exists()  # never deleted from the inbox either


def test_import_is_idempotent_never_overwrites_and_skips_reimport(tmp_path):
    inbox = tmp_path / "inbox" / "cheese"
    inbox.mkdir(parents=True)
    _make_image(inbox / "fp_cheese_01_s1_01.jpg", (230, 200, 80), seed=1)

    raw_dir = tmp_path / "raw" / "cheese"
    first = import_class("cheese", inbox, raw_dir)
    assert len(first.imported) == 1

    second = import_class("cheese", inbox, raw_dir)
    assert second.imported == []
    assert len(second.skipped_existing) == 1


def test_import_skips_byte_identical_duplicate_under_a_different_filename(tmp_path):
    """The same photo saved twice under two different names in the inbox
    (an easy accident) must not be imported twice - the second copy is
    reported as a duplicate, not silently added as a second specimen/photo."""
    inbox = tmp_path / "inbox" / "chicken"
    inbox.mkdir(parents=True)
    src = inbox / "fp_chicken_01_s1_01.jpg"
    _make_image(src, (220, 180, 170), seed=1)
    duplicate = inbox / "fp_chicken_01_s1_01_copy.jpg"
    duplicate.write_bytes(src.read_bytes())  # byte-identical copy, different name

    raw_dir = tmp_path / "raw" / "chicken"
    result = import_class("chicken", inbox, raw_dir)

    assert len(result.imported) == 1
    assert len(result.skipped_duplicate) == 1


def test_import_first_party_raises_on_unknown_class_folder_never_guesses(tmp_path):
    inbox = tmp_path / "inbox"
    (inbox / "brocolli").mkdir(parents=True)  # typo - not a real class
    _make_image(inbox / "brocolli" / "a.jpg", (0, 150, 0), seed=1)

    class_map = ClassMap(version="test", classes=("broccoli", "egg"))
    try:
        import_first_party(inbox, tmp_path / "raw", class_map)
        raised = False
    except ValueError as exc:
        raised = True
        assert "brocolli" in str(exc)
    assert raised
    # nothing should have been imported anywhere
    assert not (tmp_path / "raw").exists()


def test_import_first_party_handles_multiple_classes(tmp_path):
    inbox = tmp_path / "inbox"
    (inbox / "egg").mkdir(parents=True)
    (inbox / "milk").mkdir(parents=True)
    _make_image(inbox / "egg" / "fp_egg_01_s1_01.jpg", (230, 220, 180), seed=1)
    _make_image(inbox / "milk" / "fp_milk_01_s1_01.jpg", (200, 200, 220), seed=2)

    class_map = ClassMap(version="test", classes=("egg", "milk", "bread"))
    results = import_first_party(inbox, tmp_path / "raw", class_map)

    assert set(results.keys()) == {"egg", "milk"}
    assert len(results["egg"].imported) == 1
    assert len(results["milk"].imported) == 1


def test_import_first_party_returns_empty_when_inbox_missing(tmp_path):
    class_map = ClassMap(version="test", classes=("egg",))
    results = import_first_party(tmp_path / "does_not_exist", tmp_path / "raw", class_map)
    assert results == {}

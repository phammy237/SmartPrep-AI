"""Unit tests for scripts/acquire/open_images.py - no network.

`cache_file` (the only function that downloads the big CSVs) is monkeypatched
to serve tiny hand-written CSVs, and `fetch` is injected, so the selection and
provenance logic run for real against fixture data.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.acquire import open_images as oi
from tests.conftest import make_tiny_image_bytes

MIDS = {"Apple": "/m/apple", "Banana": "/m/banana", "Pizza": "/m/pizza", "Bird": "/m/bird", "Egg": "/m/egg"}


def _meta(image_id, author="a1", license_url=oi.LICENSE_URL):
    return {
        "ImageID": image_id,
        "OriginalURL": f"http://x/{image_id}_o.jpg",
        "OriginalLandingURL": f"https://flickr/{image_id}",
        "License": license_url,
        "AuthorProfileURL": f"https://flickr/people/{author}",
        "Author": author,
        "Title": f"t{image_id}",
        "OriginalMD5": "",
        "Thumbnail300KURL": f"http://x/{image_id}_z.jpg",
    }


def test_select_images_applies_all_rules():
    mid_to_class = {"/m/apple": "apple", "/m/banana": "banana"}
    positives = {
        "ok": {"/m/apple"},
        "two_classes": {"/m/apple", "/m/banana"},  # multi-ingredient -> dropped
        "plated": {"/m/apple", "/m/pizza"},  # excluded label -> dropped
        "badlicense": {"/m/banana"},
        "nometa": {"/m/banana"},
        "ban": {"/m/banana"},
    }
    metadata = {
        "ok": _meta("ok"),
        "two_classes": _meta("two_classes"),
        "plated": _meta("plated"),
        "badlicense": _meta("badlicense", license_url="https://creativecommons.org/licenses/by-nc/2.0/"),
        "ban": _meta("ban", author="b1"),
    }
    sel = oi.select_images(positives, metadata, mid_to_class, {"/m/pizza"}, per_class=10, max_per_author=5, seed=1)
    assert [m["ImageID"] for m in sel["apple"]] == ["ok"]
    assert [m["ImageID"] for m in sel["banana"]] == ["ban"]


def test_select_images_caps_per_author_and_per_class_deterministically():
    positives = {f"i{n}": {"/m/apple"} for n in range(20)}
    metadata = {f"i{n}": _meta(f"i{n}", author="same" if n < 10 else f"a{n}") for n in range(20)}
    args = (positives, metadata, {"/m/apple": "apple"}, set())
    first = oi.select_images(*args, per_class=8, max_per_author=2, seed=7)["apple"]
    second = oi.select_images(*args, per_class=8, max_per_author=2, seed=7)["apple"]
    assert [m["ImageID"] for m in first] == [m["ImageID"] for m in second]
    assert len(first) == 8
    assert sum(1 for m in first if m["Author"] == "same") <= 2


def test_read_positive_labels_keeps_only_verified_wanted(tmp_path):
    p = tmp_path / "labels.csv"
    p.write_text(
        "ImageID,Source,LabelName,Confidence\n"
        "a,verification,/m/apple,1.0\n"
        "a,verification,/m/other,1.0\n"
        "b,verification,/m/apple,0.0\n",
        encoding="utf-8",
    )
    assert oi.read_positive_labels(p, {"/m/apple"}) == {"a": {"/m/apple"}}


def _write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def test_acquire_end_to_end_writes_provenance_and_attribution(tmp_path, monkeypatch):
    desc = tmp_path / "desc.csv"
    _write_csv(desc, ["a", "b"], [])
    desc.write_text("\n".join(f"{m},{n}" for n, m in {**MIDS, "Banana": "/m/banana"}.items()) + "\n", encoding="utf-8")
    labels = tmp_path / "labels.csv"
    _write_csv(
        labels,
        ["ImageID", "Source", "LabelName", "Confidence"],
        [["g1", "v", "/m/apple", "1.0"], ["g2", "v", "/m/apple", "1.0"], ["bad", "v", "/m/apple", "1.0"], ["bad", "v", "/m/pizza", "1.0"]],
    )
    images = tmp_path / "images.csv"
    header = list(_meta("x"))
    _write_csv(images, header, [list(_meta(i, author=a).values()) for i, a in (("g1", "p1"), ("g2", "p2"), ("bad", "p3"))])

    served = {oi.CLASS_DESCRIPTIONS_URL: desc, oi.LABELS_URLS["validation"]: labels, oi.IMAGES_URLS["validation"]: images}
    monkeypatch.setattr(oi, "cache_file", lambda url, cache_dir: served[url])
    monkeypatch.setattr(oi, "ALL_CLASS_TO_OI_NAME", {"apple": "Apple", "banana": "Banana", "egg": "Egg"})

    def fake_fetch(meta, dest):
        dest.write_bytes(make_tiny_image_bytes((200, 0, 0), size=32, seed=1, format="JPEG"))
        return meta["ImageID"] != "g2"  # one failed download is dropped, not fatal

    candidates, attribution = oi.acquire(
        tmp_path / "out", tmp_path / "cache", classes=("apple",), splits=("validation",), fetch=fake_fetch
    )
    assert [c.original_id for c in candidates] == ["g1"]
    c = candidates[0]
    assert (c.label, c.source_dataset, c.license, c.first_party) == ("apple", "open_images_v7", "CC BY 2.0", False)
    assert c.group == "open_images_v7:apple:https://flickr/people/p1"
    assert c.source_label == "Apple"
    assert attribution[0]["author"] == "p1" and attribution[0]["license"] == oi.LICENSE_URL


def test_chicken_is_opt_in():
    assert "chicken" not in oi.DEFAULT_CLASSES
    assert set(oi.CLASS_TO_OI_NAME) - set(oi.DEFAULT_CLASSES) == {"chicken"}


def test_extended_classes_do_not_overlap_core_and_resolve_names():
    assert not set(oi.EXTRA_CLASS_TO_OI_NAME) & set(oi.CLASS_TO_OI_NAME)
    assert oi.EXTRA_CLASS_TO_OI_NAME["bell_pepper"] == "Bell pepper"
    assert set(oi.ALL_CLASS_TO_OI_NAME) == set(oi.CLASS_TO_OI_NAME) | set(oi.EXTRA_CLASS_TO_OI_NAME)

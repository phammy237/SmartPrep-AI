"""Class mapping stability - the canonical taxonomy file must not silently
change shape (labels, order, or count) out from under training/eval/inference."""

from __future__ import annotations

import json

import pytest

from src.utils.classes import ClassMap, class_map_from_dict, load_class_map

EXPECTED_V0_CLASSES = (
    "apple",
    "banana",
    "tomato",
    "onion",
    "potato",
    "carrot",
    "broccoli",
    "spinach",
    "egg",
    "milk",
    "bread",
    "chicken",
    "cheese",
)


def test_default_class_map_matches_the_documented_v0_taxonomy():
    class_map = load_class_map()
    assert class_map.version == "v0"
    assert class_map.classes == EXPECTED_V0_CLASSES
    assert len(class_map) == 13


def test_index_of_and_label_of_are_inverses():
    class_map = load_class_map()
    for i, label in enumerate(class_map):
        assert class_map.index_of(label) == i
        assert class_map.label_of(i) == label


def test_unknown_label_raises_keyerror():
    class_map = load_class_map()
    with pytest.raises(KeyError):
        class_map.index_of("durian")


def test_out_of_range_index_raises():
    class_map = load_class_map()
    with pytest.raises(IndexError):
        class_map.label_of(len(class_map))


def test_round_trip_through_to_dict_and_class_map_from_dict():
    original = load_class_map()
    restored = class_map_from_dict(original.to_dict())
    assert restored == original


def test_duplicate_labels_are_rejected(tmp_path):
    bad_path = tmp_path / "classes.json"
    bad_path.write_text(json.dumps({"version": "bad", "classes": ["apple", "banana", "apple"]}))
    with pytest.raises(ValueError, match="Duplicate"):
        load_class_map(bad_path)


def test_empty_class_list_is_rejected(tmp_path):
    empty_path = tmp_path / "classes.json"
    empty_path.write_text(json.dumps({"version": "empty", "classes": []}))
    with pytest.raises(ValueError, match="No classes"):
        load_class_map(empty_path)


def test_class_map_len_and_iter(tiny_class_map: ClassMap):
    assert len(tiny_class_map) == 3
    assert list(tiny_class_map) == ["apple", "banana", "carrot"]

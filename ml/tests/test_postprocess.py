"""Inference post-processing / top-k formatting - pure logic, no torch/model
needed. This is the exact contract ml/README.md documents for `predict.py`."""

from __future__ import annotations

import pytest

from src.inference.postprocess import format_top_k


def test_format_top_k_picks_the_highest_probability_as_predicted_class(tiny_class_map):
    result = format_top_k([0.1, 0.7, 0.2], tiny_class_map, k=3)
    assert result["predicted_class"] == "banana"
    assert result["confidence"] == 0.7


def test_format_top_k_orders_the_top_k_list_descending(tiny_class_map):
    result = format_top_k([0.1, 0.7, 0.2], tiny_class_map, k=3)
    confidences = [entry["confidence"] for entry in result["top_k"]]
    assert confidences == sorted(confidences, reverse=True)
    assert [entry["class"] for entry in result["top_k"]] == ["banana", "carrot", "apple"]


def test_format_top_k_respects_k_smaller_than_class_count(tiny_class_map):
    result = format_top_k([0.1, 0.7, 0.2], tiny_class_map, k=2)
    assert len(result["top_k"]) == 2
    assert result["predicted_class"] == "banana"


def test_format_top_k_clamps_k_larger_than_class_count(tiny_class_map):
    result = format_top_k([0.1, 0.7, 0.2], tiny_class_map, k=10)
    assert len(result["top_k"]) == 3


def test_format_top_k_rounds_confidence(tiny_class_map):
    result = format_top_k([0.111111, 0.777777, 0.111112], tiny_class_map, k=1)
    assert result["confidence"] == 0.7778


def test_format_top_k_rejects_mismatched_length(tiny_class_map):
    with pytest.raises(ValueError, match="probabilities"):
        format_top_k([0.5, 0.5], tiny_class_map, k=1)


def test_format_top_k_rejects_k_below_one(tiny_class_map):
    with pytest.raises(ValueError, match="k must be"):
        format_top_k([0.1, 0.7, 0.2], tiny_class_map, k=0)


def test_result_contract_has_exactly_the_documented_keys(tiny_class_map):
    result = format_top_k([0.1, 0.7, 0.2], tiny_class_map, k=3)
    assert set(result.keys()) == {"predicted_class", "confidence", "top_k"}
    for entry in result["top_k"]:
        assert set(entry.keys()) == {"class", "confidence"}

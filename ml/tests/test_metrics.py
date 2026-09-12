"""Evaluation metrics helpers - checked against hand-computable small examples,
not a real model's output, so the expected numbers are exact."""

from __future__ import annotations

from src.evaluation.metrics import compute_classification_metrics, compute_top_k_accuracy
from src.evaluation.report import top_confidence_errors


def test_perfect_predictions_give_all_ones(tiny_class_map):
    y_true = [0, 1, 2, 0, 1, 2]
    y_pred = [0, 1, 2, 0, 1, 2]
    metrics = compute_classification_metrics(y_true, y_pred, tiny_class_map)
    assert metrics["accuracy"] == 1.0
    assert metrics["macro_precision"] == 1.0
    assert metrics["macro_recall"] == 1.0
    assert metrics["macro_f1"] == 1.0
    for label in tiny_class_map:
        assert metrics["per_class"][label]["precision"] == 1.0
        assert metrics["per_class"][label]["recall"] == 1.0


def test_confusion_matrix_shape_and_diagonal_for_perfect_predictions(tiny_class_map):
    y_true = [0, 1, 2]
    y_pred = [0, 1, 2]
    metrics = compute_classification_metrics(y_true, y_pred, tiny_class_map)
    cm = metrics["confusion_matrix"]
    assert len(cm) == 3 and all(len(row) == 3 for row in cm)
    assert cm[0][0] == 1 and cm[1][1] == 1 and cm[2][2] == 1
    assert metrics["confusion_matrix_labels"] == list(tiny_class_map)


def test_known_error_pattern_gives_expected_accuracy(tiny_class_map):
    # 4 correct, 1 wrong (apple predicted as banana) out of 5.
    y_true = [0, 0, 1, 1, 2]
    y_pred = [0, 1, 1, 1, 2]
    metrics = compute_classification_metrics(y_true, y_pred, tiny_class_map)
    assert metrics["accuracy"] == 4 / 5


def test_support_counts_match_class_frequency_in_y_true(tiny_class_map):
    y_true = [0, 0, 0, 1, 2]
    y_pred = [0, 0, 0, 1, 2]
    metrics = compute_classification_metrics(y_true, y_pred, tiny_class_map)
    assert metrics["per_class"]["apple"]["support"] == 3
    assert metrics["per_class"]["banana"]["support"] == 1
    assert metrics["per_class"]["carrot"]["support"] == 1


def test_top_k_accuracy_counts_true_label_within_the_top_k():
    y_true = [0, 1, 2]
    # Row 0's true label (0) has the LOWEST probability (0.1), so it's outside
    # the top-2 ({1: 0.5, 2: 0.4}) too - only rows 1 and 2 are ever correct here.
    y_proba = [
        [0.1, 0.5, 0.4],
        [0.2, 0.7, 0.1],
        [0.1, 0.2, 0.7],
    ]
    top1 = compute_top_k_accuracy(y_true, y_proba, k=1, num_classes=3)
    top2 = compute_top_k_accuracy(y_true, y_proba, k=2, num_classes=3)
    assert top1 == 2 / 3
    assert top2 == 2 / 3


def test_top_k_accuracy_is_trivially_one_when_k_covers_every_class():
    assert compute_top_k_accuracy([0], [[0.9, 0.1]], k=2, num_classes=2) == 1.0


def test_top_confidence_errors_only_returns_wrong_predictions_sorted_desc():
    records = [
        {"path": "a", "true_label": "apple", "pred_label": "apple", "confidence": 0.99},  # correct - excluded
        {"path": "b", "true_label": "apple", "pred_label": "banana", "confidence": 0.6},
        {"path": "c", "true_label": "banana", "pred_label": "carrot", "confidence": 0.9},
        {"path": "d", "true_label": "carrot", "pred_label": "carrot", "confidence": 0.5},  # correct - excluded
    ]
    top = top_confidence_errors(records, k=10)
    assert [r["path"] for r in top] == ["c", "b"]


def test_top_confidence_errors_respects_k():
    records = [
        {"path": str(i), "true_label": "apple", "pred_label": "banana", "confidence": i / 10}
        for i in range(5)
    ]
    top = top_confidence_errors(records, k=2)
    assert len(top) == 2
    assert top[0]["confidence"] > top[1]["confidence"]

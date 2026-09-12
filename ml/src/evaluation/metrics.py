"""Test-set evaluation metrics. Pure functions over plain lists/arrays of
predictions - no torch dependency, no model/dataloader - so they are directly
unit-testable with hand-built label lists.
"""

from __future__ import annotations

from src.utils.classes import ClassMap


def compute_classification_metrics(y_true: list[int], y_pred: list[int], class_map: ClassMap) -> dict:
    from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support

    labels = list(range(len(class_map)))
    accuracy = accuracy_score(y_true, y_pred)
    macro_precision, macro_recall, macro_f1, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, average="macro", zero_division=0
    )
    per_precision, per_recall, per_f1, per_support = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=labels)

    per_class = {
        class_map.label_of(i): {
            "precision": float(per_precision[i]),
            "recall": float(per_recall[i]),
            "f1": float(per_f1[i]),
            "support": int(per_support[i]),
        }
        for i in labels
    }

    return {
        "accuracy": float(accuracy),
        "macro_precision": float(macro_precision),
        "macro_recall": float(macro_recall),
        "macro_f1": float(macro_f1),
        "per_class": per_class,
        "confusion_matrix": cm.tolist(),
        "confusion_matrix_labels": list(class_map),
    }


def compute_top_k_accuracy(y_true: list[int], y_proba, k: int, num_classes: int) -> float:
    """`y_proba` is (n_samples, num_classes). Returns the fraction of samples
    whose true label is among the top `k` predicted classes."""
    from sklearn.metrics import top_k_accuracy_score

    if k >= num_classes:
        # sklearn requires k < n_classes when labels are passed explicitly;
        # top-k accuracy is trivially 1.0 once k covers every class anyway.
        return 1.0
    return float(top_k_accuracy_score(y_true, y_proba, k=k, labels=list(range(num_classes))))

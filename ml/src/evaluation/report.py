"""Reporting helpers on top of metrics.py: the confusion-matrix PNG and a list
of the highest-confidence WRONG predictions (for manual error inspection).
"""

from __future__ import annotations

from pathlib import Path


def plot_confusion_matrix(confusion_matrix: list[list[int]], labels: list[str], out_path: str | Path) -> None:
    import matplotlib

    matplotlib.use("Agg")  # headless - no display available in a training run
    import matplotlib.pyplot as plt
    import numpy as np

    cm = np.array(confusion_matrix)
    fig, ax = plt.subplots(figsize=(max(6, len(labels) * 0.6), max(5, len(labels) * 0.6)))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(labels)))
    ax.set_yticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha="right")
    ax.set_yticklabels(labels)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title("Confusion matrix")
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, str(cm[i, j]), ha="center", va="center", fontsize=8)
    fig.colorbar(im, ax=ax)
    fig.tight_layout()

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path)
    plt.close(fig)


def top_confidence_errors(records: list[dict], k: int = 10) -> list[dict]:
    """`records` is one dict per evaluated sample:
    {"path": str, "true_label": str, "pred_label": str, "confidence": float}.
    Returns the `k` WRONG predictions with the highest confidence - the cases
    where the model was most convincingly mistaken, usually the most useful
    to look at first."""
    wrong = [r for r in records if r["true_label"] != r["pred_label"]]
    wrong_sorted = sorted(wrong, key=lambda r: r["confidence"], reverse=True)
    return wrong_sorted[:k]

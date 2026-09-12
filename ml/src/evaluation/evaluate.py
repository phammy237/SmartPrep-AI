"""CLI entrypoint: checkpoint + manifest -> held-out TEST split evaluation.

The test split must only be used here, for final reporting - never to pick
hyperparameters or the "best" epoch (that's val, inside train.py). Running
this script twice against the same checkpoint does not change the model.

Usage (from the ml/ directory):
    python -m src.evaluation.evaluate --checkpoint outputs/<run>/best_model.pt --manifest data/splits/manifest.csv
"""

from __future__ import annotations

import argparse

from src.datasets.ingredient_dataset import IngredientImageDataset
from src.datasets.manifest import read_manifest, rows_for_split
from src.datasets.transforms import build_eval_transform
from src.evaluation.metrics import compute_classification_metrics, compute_top_k_accuracy
from src.evaluation.report import plot_confusion_matrix, top_confidence_errors
from src.training.model import build_model
from src.utils.classes import class_map_from_dict
from src.utils.device import get_device
from src.utils.io import save_json


def run_evaluation(checkpoint_path: str, manifest_path: str, device_pref: str = "auto", top_k: int = 3) -> dict:
    import torch
    from torch.utils.data import DataLoader

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    class_map = class_map_from_dict(checkpoint["class_map"])
    device = get_device(device_pref)

    model = build_model(checkpoint["backbone"], num_classes=len(class_map), pretrained=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()

    rows = rows_for_split(read_manifest(manifest_path), "test")
    if not rows:
        raise ValueError(f"Manifest {manifest_path} has no 'test' split rows - nothing to evaluate.")

    dataset = IngredientImageDataset(rows, class_map, transform=build_eval_transform(checkpoint["image_size"]))
    loader = DataLoader(dataset, batch_size=32, shuffle=False)

    y_true: list[int] = []
    y_pred: list[int] = []
    y_proba: list[list[float]] = []
    error_records: list[dict] = []

    row_index = 0
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            logits = model(images)
            probs = torch.softmax(logits, dim=1).cpu()
            preds = probs.argmax(dim=1)

            for i in range(labels.size(0)):
                true_idx = int(labels[i].item())
                pred_idx = int(preds[i].item())
                confidence = float(probs[i, pred_idx].item())
                y_true.append(true_idx)
                y_pred.append(pred_idx)
                y_proba.append(probs[i].tolist())
                error_records.append(
                    {
                        "path": rows[row_index].path,
                        "true_label": class_map.label_of(true_idx),
                        "pred_label": class_map.label_of(pred_idx),
                        "confidence": confidence,
                    }
                )
                row_index += 1

    metrics = compute_classification_metrics(y_true, y_pred, class_map)
    metrics["top_k_accuracy"] = {
        str(top_k): compute_top_k_accuracy(y_true, y_proba, k=top_k, num_classes=len(class_map))
    }
    metrics["num_test_examples"] = len(rows)
    metrics["highest_confidence_errors"] = top_confidence_errors(error_records, k=10)
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a saved checkpoint against the held-out test split.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--output-dir", default=None, help="Defaults to the checkpoint's own directory.")
    args = parser.parse_args()

    from pathlib import Path

    metrics = run_evaluation(args.checkpoint, args.manifest, args.device, args.top_k)

    output_dir = Path(args.output_dir) if args.output_dir else Path(args.checkpoint).parent
    save_json(metrics, output_dir / "test_metrics.json")
    plot_confusion_matrix(
        metrics["confusion_matrix"], metrics["confusion_matrix_labels"], output_dir / "confusion_matrix.png"
    )

    print(f"Test accuracy: {metrics['accuracy']:.4f}")
    print(f"Macro F1: {metrics['macro_f1']:.4f}")
    print(f"Top-{args.top_k} accuracy: {metrics['top_k_accuracy'][str(args.top_k)]:.4f}")
    print(f"Wrote: {output_dir / 'test_metrics.json'}, {output_dir / 'confusion_matrix.png'}")


if __name__ == "__main__":
    main()

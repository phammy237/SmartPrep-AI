"""CLI entrypoint: config -> manifest -> dataloaders -> model -> training loop
-> best checkpoint + config + class map + history + metrics, all written under
one run directory. See ml/README.md for the exact command.

Usage (from the ml/ directory):
    python -m src.training.train --config configs/v0_baseline.yaml
"""

from __future__ import annotations

import argparse
import copy

from src.datasets.ingredient_dataset import IngredientImageDataset
from src.datasets.manifest import build_or_load_manifest, rows_for_split
from src.datasets.transforms import build_eval_transform, build_train_transform
from src.training.config import TrainingConfig, load_config
from src.training.engine import build_optimizer, evaluate_loss_and_accuracy, train_one_epoch
from src.training.model import build_model
from src.utils.classes import load_class_map
from src.utils.device import get_device
from src.utils.io import create_run_dir, save_json
from src.utils.seed import set_seed


def run_training(cfg: TrainingConfig) -> dict:
    """Returns a summary dict (run_dir, best_epoch, best_val_accuracy, history) -
    the actual artifacts are written to disk, not just returned, so a crashed
    or killed run still leaves whatever completed on disk."""
    import torch
    from torch.utils.data import DataLoader

    set_seed(cfg.seed)
    class_map = load_class_map(cfg.classes_path)
    device = get_device(cfg.device)

    rows = build_or_load_manifest(
        data_dir=cfg.data_dir,
        class_map=class_map,
        manifest_path=cfg.manifest_path,
        split=cfg.split,
        seed=cfg.seed,
        force=cfg.force_resplit,
    )
    train_rows = rows_for_split(rows, "train")
    val_rows = rows_for_split(rows, "val")
    if not train_rows:
        raise ValueError("Manifest has no rows in the 'train' split - nothing to train on.")
    if not val_rows:
        raise ValueError("Manifest has no rows in the 'val' split - cannot select a best checkpoint.")

    train_dataset = IngredientImageDataset(
        train_rows, class_map, transform=build_train_transform(cfg.image_size, cfg.augmentation)
    )
    val_dataset = IngredientImageDataset(val_rows, class_map, transform=build_eval_transform(cfg.image_size))

    # drop_last=True on the TRAIN loader only: several backbones use
    # BatchNorm, which cannot compute a variance from a batch of size 1 - a
    # dataset whose size isn't a multiple of batch_size would otherwise crash
    # on its final training batch. Validation/test never drop samples (below
    # and in evaluate.py) since every held-out example must be scored.
    train_loader = DataLoader(
        train_dataset, batch_size=cfg.batch_size, shuffle=True, num_workers=cfg.num_workers, drop_last=True
    )
    val_loader = DataLoader(
        val_dataset, batch_size=cfg.batch_size, shuffle=False, num_workers=cfg.num_workers, drop_last=False
    )
    if len(train_loader) == 0:
        raise ValueError(
            f"batch_size={cfg.batch_size} is larger than the {len(train_dataset)}-example train split "
            "(drop_last=True leaves zero full batches) - lower batch_size or grow the dataset."
        )

    model = build_model(cfg.backbone, num_classes=len(class_map), pretrained=cfg.pretrained).to(device)
    optimizer = build_optimizer(model, cfg.optimizer, cfg.learning_rate, cfg.weight_decay)
    criterion = torch.nn.CrossEntropyLoss()

    run_dir = create_run_dir(cfg.output_dir, cfg.run_name)
    history: list[dict] = []
    best_val_accuracy = -1.0
    best_epoch = -1
    best_state_dict = None
    epochs_without_improvement = 0

    for epoch in range(1, cfg.epochs + 1):
        train_metrics = train_one_epoch(model, train_loader, optimizer, criterion, device)
        val_metrics = evaluate_loss_and_accuracy(model, val_loader, criterion, device)
        history.append(
            {
                "epoch": epoch,
                "train_loss": train_metrics["loss"],
                "train_accuracy": train_metrics["accuracy"],
                "val_loss": val_metrics["loss"],
                "val_accuracy": val_metrics["accuracy"],
            }
        )

        improved = val_metrics["accuracy"] > best_val_accuracy + cfg.early_stopping.min_delta
        if improved:
            best_val_accuracy = val_metrics["accuracy"]
            best_epoch = epoch
            best_state_dict = copy.deepcopy(model.state_dict())
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1

        if cfg.early_stopping.enabled and epochs_without_improvement >= cfg.early_stopping.patience:
            break

    if best_state_dict is None:
        # Should not happen (epoch 1 always "improves" over -1.0), but guard
        # against ever writing a checkpoint that wasn't actually selected.
        raise RuntimeError("Training completed without ever selecting a best checkpoint.")

    checkpoint = {
        "model_state_dict": best_state_dict,
        "backbone": cfg.backbone,
        "image_size": cfg.image_size,
        "class_map": class_map.to_dict(),
        "model_version": f"ingredient-classifier-{cfg.run_name}",
        "best_epoch": best_epoch,
        "best_val_accuracy": best_val_accuracy,
    }
    torch.save(checkpoint, run_dir / "best_model.pt")
    save_json(cfg.to_dict(), run_dir / "config.json")
    save_json(class_map.to_dict(), run_dir / "class_map.json")
    save_json(history, run_dir / "history.json")
    save_json(
        {"best_epoch": best_epoch, "best_val_accuracy": best_val_accuracy, "epochs_run": len(history)},
        run_dir / "metrics.json",
    )

    return {
        "run_dir": str(run_dir),
        "best_epoch": best_epoch,
        "best_val_accuracy": best_val_accuracy,
        "history": history,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the SmartPrep ingredient classification baseline (v0).")
    parser.add_argument("--config", required=True, help="Path to a training YAML config, e.g. configs/v0_baseline.yaml")
    args = parser.parse_args()

    cfg = load_config(args.config)
    summary = run_training(cfg)
    print(f"Best epoch: {summary['best_epoch']} (val_accuracy={summary['best_val_accuracy']:.4f})")
    print(f"Artifacts written to: {summary['run_dir']}")


if __name__ == "__main__":
    main()

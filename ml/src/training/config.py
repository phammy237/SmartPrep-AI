"""Single source of truth for training configuration - see ml/configs/v0_baseline.yaml
for the actual v0 values. No training parameter should live as a bare literal
scattered through train.py/evaluate.py/predict.py; add a field here instead.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import yaml

SUPPORTED_OPTIMIZERS = ("adamw", "sgd")
SUPPORTED_BACKBONES = ("resnet18", "efficientnet_b0", "mobilenet_v3_small")


@dataclass
class SplitConfig:
    train: float = 0.7
    val: float = 0.15
    test: float = 0.15

    def validate(self) -> None:
        total = self.train + self.val + self.test
        if not (0.999 <= total <= 1.001):
            raise ValueError(f"split.train + split.val + split.test must sum to 1.0, got {total}")
        for name, value in (("train", self.train), ("val", self.val), ("test", self.test)):
            if not (0.0 < value < 1.0):
                raise ValueError(f"split.{name} must be strictly between 0 and 1, got {value}")


@dataclass
class AugmentationConfig:
    """Train-time-only augmentation. Validation/test always use the deterministic
    transform in src/datasets/transforms.py, regardless of these settings."""

    random_horizontal_flip: bool = True
    random_rotation_degrees: float = 10.0
    color_jitter: bool = True


@dataclass
class EarlyStoppingConfig:
    enabled: bool = True
    patience: int = 5
    min_delta: float = 0.001

    def validate(self) -> None:
        if self.patience < 1:
            raise ValueError(f"early_stopping.patience must be >= 1, got {self.patience}")
        if self.min_delta < 0:
            raise ValueError(f"early_stopping.min_delta must be >= 0, got {self.min_delta}")


@dataclass
class TrainingConfig:
    run_name: str = "v0-baseline"
    seed: int = 42

    # Data
    classes_path: str = "configs/classes.json"
    data_dir: str = "data/raw"
    manifest_path: str = "data/splits/manifest.csv"
    # If a manifest already exists at manifest_path, it is loaded as-is UNLESS
    # this is true - training must never silently resplit a dataset run-to-run
    # (see src/datasets/manifest.py).
    force_resplit: bool = False
    group_by_stem_prefix: bool = True

    # Model / optimization
    image_size: int = 224
    batch_size: int = 32
    epochs: int = 20
    learning_rate: float = 1e-3
    optimizer: str = "adamw"
    weight_decay: float = 1e-4
    pretrained: bool = True
    backbone: str = "resnet18"

    # Runtime
    num_workers: int = 2
    device: str = "auto"
    output_dir: str = "outputs"

    split: SplitConfig = field(default_factory=SplitConfig)
    augmentation: AugmentationConfig = field(default_factory=AugmentationConfig)
    early_stopping: EarlyStoppingConfig = field(default_factory=EarlyStoppingConfig)

    def validate(self) -> None:
        self.split.validate()
        self.early_stopping.validate()
        if self.optimizer not in SUPPORTED_OPTIMIZERS:
            raise ValueError(f"optimizer must be one of {SUPPORTED_OPTIMIZERS}, got {self.optimizer!r}")
        if self.backbone not in SUPPORTED_BACKBONES:
            raise ValueError(f"backbone must be one of {SUPPORTED_BACKBONES}, got {self.backbone!r}")
        if self.batch_size <= 0:
            raise ValueError(f"batch_size must be > 0, got {self.batch_size}")
        if self.epochs <= 0:
            raise ValueError(f"epochs must be > 0, got {self.epochs}")
        if self.image_size <= 0:
            raise ValueError(f"image_size must be > 0, got {self.image_size}")
        if self.learning_rate <= 0:
            raise ValueError(f"learning_rate must be > 0, got {self.learning_rate}")
        if self.weight_decay < 0:
            raise ValueError(f"weight_decay must be >= 0, got {self.weight_decay}")
        if self.num_workers < 0:
            raise ValueError(f"num_workers must be >= 0, got {self.num_workers}")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def config_from_dict(raw: dict[str, Any]) -> TrainingConfig:
    raw = dict(raw)  # don't mutate the caller's dict
    split_raw = raw.pop("split", None)
    augmentation_raw = raw.pop("augmentation", None)
    early_stopping_raw = raw.pop("early_stopping", None)

    unknown = set(raw) - set(TrainingConfig.__dataclass_fields__)
    if unknown:
        raise ValueError(f"Unknown training config field(s): {sorted(unknown)}")

    cfg = TrainingConfig(**raw)
    if split_raw is not None:
        cfg.split = SplitConfig(**split_raw)
    if augmentation_raw is not None:
        cfg.augmentation = AugmentationConfig(**augmentation_raw)
    if early_stopping_raw is not None:
        cfg.early_stopping = EarlyStoppingConfig(**early_stopping_raw)
    return cfg


def load_config(path: str | Path) -> TrainingConfig:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    cfg = config_from_dict(raw)
    cfg.validate()
    return cfg

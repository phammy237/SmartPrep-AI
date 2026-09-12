"""Configuration parsing/validation - every training knob is a config field,
never a scattered literal, and an invalid config must fail loudly and early."""

from __future__ import annotations

import pytest
import yaml

from src.training.config import (
    AugmentationConfig,
    EarlyStoppingConfig,
    SplitConfig,
    TrainingConfig,
    config_from_dict,
    load_config,
)


def test_defaults_are_internally_valid():
    TrainingConfig().validate()  # must not raise


def test_the_tracked_v0_baseline_config_loads_and_validates(tmp_path):
    import pathlib

    v0_path = pathlib.Path(__file__).resolve().parents[1] / "configs" / "v0_baseline.yaml"
    cfg = load_config(v0_path)
    assert cfg.backbone == "resnet18"
    assert cfg.classes_path == "configs/classes.json"


def test_nested_sections_parse_into_their_dataclasses():
    cfg = config_from_dict(
        {
            "backbone": "efficientnet_b0",
            "split": {"train": 0.8, "val": 0.1, "test": 0.1},
            "augmentation": {"random_horizontal_flip": False, "random_rotation_degrees": 0, "color_jitter": False},
            "early_stopping": {"enabled": False, "patience": 3, "min_delta": 0.0},
        }
    )
    assert cfg.backbone == "efficientnet_b0"
    assert cfg.split == SplitConfig(train=0.8, val=0.1, test=0.1)
    assert cfg.augmentation == AugmentationConfig(False, 0, False)
    assert cfg.early_stopping == EarlyStoppingConfig(False, 3, 0.0)


def test_unknown_top_level_field_is_rejected():
    with pytest.raises(ValueError, match="Unknown"):
        config_from_dict({"totally_made_up_field": 1})


@pytest.mark.parametrize(
    "overrides",
    [
        {"split": {"train": 0.5, "val": 0.5, "test": 0.5}},  # sums to > 1
        {"optimizer": "rmsprop"},
        {"backbone": "resnet50"},
        {"batch_size": 0},
        {"epochs": 0},
        {"image_size": 0},
        {"learning_rate": 0},
        {"weight_decay": -1},
        {"num_workers": -1},
    ],
)
def test_invalid_values_are_rejected(overrides):
    cfg = config_from_dict(overrides)
    with pytest.raises(ValueError):
        cfg.validate()


def test_load_config_reads_yaml_and_validates(tmp_path):
    path = tmp_path / "cfg.yaml"
    path.write_text(yaml.safe_dump({"epochs": 3, "batch_size": 4}))
    cfg = load_config(path)
    assert cfg.epochs == 3
    assert cfg.batch_size == 4


def test_load_config_propagates_validation_errors(tmp_path):
    path = tmp_path / "cfg.yaml"
    path.write_text(yaml.safe_dump({"epochs": -1}))
    with pytest.raises(ValueError):
        load_config(path)


def test_to_dict_is_a_plain_json_serializable_structure():
    import json

    cfg = TrainingConfig()
    json.dumps(cfg.to_dict())  # must not raise

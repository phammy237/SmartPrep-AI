"""Backbone factory - the ONE place a pretrained torchvision model gets its
classifier head replaced for SmartPrep's taxonomy. See ml/README.md for the
ResNet18 vs. EfficientNet-B0 vs. MobileNetV3-Small comparison behind the v0
default; all three remain supported so a config change is enough to compare
them later, without touching this function's callers.
"""

from __future__ import annotations

from src.training.config import SUPPORTED_BACKBONES


def build_model(backbone: str, num_classes: int, pretrained: bool = True):
    import torch.nn as nn
    from torchvision import models

    if backbone not in SUPPORTED_BACKBONES:
        raise ValueError(f"Unsupported backbone {backbone!r}. Supported: {SUPPORTED_BACKBONES}")
    if num_classes < 2:
        raise ValueError(f"num_classes must be >= 2, got {num_classes}")

    if backbone == "resnet18":
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        model = models.resnet18(weights=weights)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
        return model

    if backbone == "efficientnet_b0":
        weights = models.EfficientNet_B0_Weights.DEFAULT if pretrained else None
        model = models.efficientnet_b0(weights=weights)
        in_features = model.classifier[-1].in_features
        model.classifier[-1] = nn.Linear(in_features, num_classes)
        return model

    # backbone == "mobilenet_v3_small"
    weights = models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
    model = models.mobilenet_v3_small(weights=weights)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, num_classes)
    return model

"""Model factory: output dimension must equal the class count for every
supported backbone, and an unsupported backbone must fail loudly.

pretrained=False everywhere here - tests must not depend on downloading real
ImageNet weights over the network.
"""

from __future__ import annotations

import pytest

from src.training.config import SUPPORTED_BACKBONES
from src.training.model import build_model


@pytest.mark.parametrize("backbone", SUPPORTED_BACKBONES)
def test_output_dimension_matches_num_classes(backbone):
    import torch

    num_classes = 5
    model = build_model(backbone, num_classes=num_classes, pretrained=False)
    model.eval()

    dummy_input = torch.zeros(2, 3, 64, 64)
    with torch.no_grad():
        output = model(dummy_input)

    assert output.shape == (2, num_classes)


def test_unsupported_backbone_raises():
    with pytest.raises(ValueError, match="Unsupported backbone"):
        build_model("resnet50", num_classes=5, pretrained=False)


def test_num_classes_must_be_at_least_two():
    with pytest.raises(ValueError, match="num_classes"):
        build_model("resnet18", num_classes=1, pretrained=False)

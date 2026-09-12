"""Train vs. eval image transforms. Train applies the configured augmentation;
validation and test ALWAYS use the deterministic transform below regardless of
`AugmentationConfig` - metrics on val/test must reflect the model's actual
behavior on a fixed input, not a randomly augmented one.
"""

from __future__ import annotations

from src.training.config import AugmentationConfig

# Standard ImageNet normalization statistics - correct for every torchvision
# pretrained backbone this workspace supports (resnet18 / efficientnet_b0 /
# mobilenet_v3_small all trained on ImageNet with these stats).
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def build_train_transform(image_size: int, augmentation: AugmentationConfig):
    from torchvision import transforms

    ops = [transforms.Resize((image_size, image_size))]
    if augmentation.random_horizontal_flip:
        ops.append(transforms.RandomHorizontalFlip())
    if augmentation.random_rotation_degrees > 0:
        ops.append(transforms.RandomRotation(augmentation.random_rotation_degrees))
    if augmentation.color_jitter:
        ops.append(transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2))
    ops += [transforms.ToTensor(), transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD)]
    return transforms.Compose(ops)


def build_eval_transform(image_size: int):
    from torchvision import transforms

    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )

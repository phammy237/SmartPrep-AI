"""Dataset item shape/dtype - what the training loop actually receives per
sample must match what the model and loss function expect."""

from __future__ import annotations

from src.datasets.ingredient_dataset import IngredientImageDataset
from src.datasets.manifest import build_manifest_rows
from src.datasets.transforms import build_eval_transform, build_train_transform
from src.training.config import AugmentationConfig, SplitConfig


def test_dataset_item_is_a_chw_float_tensor_of_the_configured_size(tiny_raw_data_dir, tiny_class_map):
    split = SplitConfig(train=0.5, val=0.25, test=0.25)
    rows = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, split, seed=1)

    image_size = 32
    dataset = IngredientImageDataset(rows, tiny_class_map, transform=build_eval_transform(image_size))
    image, label = dataset[0]

    assert tuple(image.shape) == (3, image_size, image_size)
    assert image.dtype.is_floating_point
    assert isinstance(label, int)
    assert 0 <= label < len(tiny_class_map)


def test_dataset_label_matches_the_manifest_row(tiny_raw_data_dir, tiny_class_map):
    split = SplitConfig(train=0.5, val=0.25, test=0.25)
    rows = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, split, seed=1)
    dataset = IngredientImageDataset(rows, tiny_class_map, transform=build_eval_transform(32))

    for i, row in enumerate(rows):
        _image, label = dataset[i]
        assert tiny_class_map.label_of(label) == row.label


def test_dataset_len_matches_row_count(tiny_raw_data_dir, tiny_class_map):
    split = SplitConfig(train=0.5, val=0.25, test=0.25)
    rows = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, split, seed=1)
    dataset = IngredientImageDataset(rows, tiny_class_map, transform=build_eval_transform(32))
    assert len(dataset) == len(rows)


def test_train_transform_output_shape_matches_eval_transform(tiny_raw_data_dir, tiny_class_map):
    split = SplitConfig(train=1.0, val=0.0, test=0.0)
    # train=1.0 would fail SplitConfig.validate() (must be < 1) but
    # build_manifest_rows doesn't call validate() - deliberately not
    # exercising validate() here since this test only cares about transform
    # shapes, not split ratios.
    rows = build_manifest_rows(tiny_raw_data_dir, tiny_class_map, split, seed=1)

    image_size = 32
    augmentation = AugmentationConfig(random_horizontal_flip=True, random_rotation_degrees=15, color_jitter=True)
    train_dataset = IngredientImageDataset(rows, tiny_class_map, transform=build_train_transform(image_size, augmentation))
    eval_dataset = IngredientImageDataset(rows, tiny_class_map, transform=build_eval_transform(image_size))

    train_image, _ = train_dataset[0]
    eval_image, _ = eval_dataset[0]
    assert train_image.shape == eval_image.shape

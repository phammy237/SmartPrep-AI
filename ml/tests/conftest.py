"""Shared tiny synthetic fixtures. Nothing here is a real photo or a real
ingredient - these exist to exercise the pipeline's mechanics (shapes, dtypes,
file formats, determinism), never to produce a meaningful accuracy number.
See PIPELINE_VERIFIED_NOT_TRAINED.md and ml/README.md.
"""

from __future__ import annotations

import random

import pytest

from src.utils.classes import ClassMap

TINY_CLASSES = ("apple", "banana", "carrot")


@pytest.fixture
def tiny_class_map() -> ClassMap:
    return ClassMap(version="test", classes=TINY_CLASSES)


def _make_tiny_image(path, color: tuple[int, int, int], size: int = 16, seed: int = 0) -> None:
    from PIL import Image

    rng = random.Random(seed)
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for x in range(size):
        for y in range(size):
            noise = rng.randint(-15, 15)
            pixels[x, y] = tuple(max(0, min(255, channel + noise)) for channel in color)
    image.save(path)


# One deterministic-but-distinct base color per class, so a real model has a
# (trivial) signal to pick up on if a test ever runs actual training - still
# not real data, just distinguishable synthetic data.
_CLASS_COLORS = {
    "apple": (200, 30, 30),
    "banana": (220, 200, 40),
    "carrot": (230, 120, 20),
}


@pytest.fixture
def tiny_raw_data_dir(tmp_path, tiny_class_map):
    """`tmp_path/raw/<class>/<class>_session<S>_<I>.png` - 4 sessions x 3 images
    per class, so tests can also verify session-grouped splitting. 4 groups
    (not fewer) is deliberate: `assign_splits` stratifies PER CLASS, and a
    0.5/0.25/0.25 split needs at least 4 groups for every one of train/val/
    test to land non-empty for a class this small (round(4*.5)=2 train,
    round(4*.25)=1 val, remainder=1 test) - 2 or 3 groups can round a split
    to zero for val or test depending on seed, which used to be masked by
    an old (fixed) bug where all classes' groups were pooled into one global
    shuffle instead of being split independently per class."""
    raw_dir = tmp_path / "raw"
    for label in tiny_class_map:
        class_dir = raw_dir / label
        class_dir.mkdir(parents=True)
        color = _CLASS_COLORS[label]
        image_index = 0
        for session in range(1, 5):
            for i in range(1, 4):
                filename = f"{label}_session{session}_{i}.png"
                _make_tiny_image(class_dir / filename, color, seed=image_index)
                image_index += 1
    return raw_dir

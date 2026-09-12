"""The PyTorch Dataset SmartPrep's training/evaluation loops consume - a thin
wrapper over manifest rows + a class map + a transform. No dataset-specific
logic beyond that lives here; scanning/splitting is manifest.py's job.

Requires torch (this is the one dataset module that inherently needs it, since
it IS a torch.utils.data.Dataset) - manifest.py and classes.py stay
torch-free so the rest of the split/taxonomy logic is testable without it.
"""

from __future__ import annotations

from torch.utils.data import Dataset

from src.datasets.manifest import ManifestRow
from src.utils.classes import ClassMap


class IngredientImageDataset(Dataset):
    def __init__(self, rows: list[ManifestRow], class_map: ClassMap, transform=None):
        self.rows = rows
        self.class_map = class_map
        self.transform = transform

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int):
        from PIL import Image

        row = self.rows[index]
        image = Image.open(row.path).convert("RGB")
        if self.transform is not None:
            image = self.transform(image)
        label = self.class_map.index_of(row.label)
        return image, label

"""Canonical class-list loader - the ONE source of truth for class IDs/labels.

Every script that needs the taxonomy (dataset manifest building, training,
evaluation, inference) loads it from here, and this module loads it from the
single tracked file `configs/classes.json`. Nothing else in this workspace may
hardcode the class list or its ordering - that is exactly the duplication this
module exists to prevent.

Ambiguity assumptions for v0 (documented here, not enforced by code):
  - "chicken" means raw or packaged chicken meat/parts, not a cooked dish.
  - "milk" means the liquid in its typical retail container, not a splash/pour.
  - "cheese" means a block, wedge, or sliced form, not a prepared dish
    (e.g. not melted-on-pizza).
  - "bread" means a loaf/slice, not a sandwich or toast with toppings.
  - v0 assumes exactly one primary ingredient per image (see ml/README.md) -
    an image with several visible ingredients has no defined "correct" label
    and should not be included in the v0 dataset.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

# ml/configs/classes.json, resolved relative to this file so it works
# regardless of the caller's current working directory.
DEFAULT_CLASSES_PATH = Path(__file__).resolve().parents[2] / "configs" / "classes.json"


@dataclass(frozen=True)
class ClassMap:
    """An immutable, index-stable view of the taxonomy. `classes[i]` is class id `i`."""

    version: str
    classes: tuple[str, ...]

    def __len__(self) -> int:
        return len(self.classes)

    def __iter__(self):
        return iter(self.classes)

    def index_of(self, label: str) -> int:
        try:
            return self.classes.index(label)
        except ValueError as exc:
            raise KeyError(f"Unknown class label {label!r}. Known classes: {list(self.classes)}") from exc

    def label_of(self, index: int) -> str:
        if not (0 <= index < len(self.classes)):
            raise IndexError(f"Class index {index} out of range for {len(self.classes)} classes")
        return self.classes[index]

    def to_dict(self) -> dict:
        return {"version": self.version, "classes": list(self.classes)}


def load_class_map(path: str | Path | None = None) -> ClassMap:
    """Load and validate the canonical class list. Raises on duplicates/empty - a
    corrupted taxonomy file must fail loudly, never silently renumber classes."""
    resolved = Path(path) if path is not None else DEFAULT_CLASSES_PATH
    with open(resolved, "r", encoding="utf-8") as f:
        raw = json.load(f)

    classes = raw.get("classes")
    if not classes:
        raise ValueError(f"No classes found in {resolved}")
    if len(classes) != len(set(classes)):
        seen: set[str] = set()
        dupes = [c for c in classes if c in seen or seen.add(c)]
        raise ValueError(f"Duplicate class labels in {resolved}: {dupes}")

    return ClassMap(version=str(raw.get("version", "unknown")), classes=tuple(classes))


def class_map_from_dict(raw: dict) -> ClassMap:
    """Reconstruct a ClassMap from `ClassMap.to_dict()` output (e.g. embedded in a
    saved checkpoint), without re-reading configs/classes.json - a checkpoint must
    stay self-describing even if the tracked taxonomy file later changes."""
    return ClassMap(version=str(raw["version"]), classes=tuple(raw["classes"]))

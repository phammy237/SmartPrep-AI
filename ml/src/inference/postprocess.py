"""Pure top-k formatting: probabilities (a plain list of floats) + a ClassMap
-> the JSON-shaped inference result. No torch/model/image dependency, so this
is directly unit-testable without a checkpoint or even torch installed.

Kept conceptually compatible with the future SmartPrep inference provider's
`IngredientDetectionCandidate` shape (mobile/lib/scan/providers/types.ts) -
`predicted_class`/`confidence` map onto that provider's `name`/`confidence` -
but this module has no integration with the Expo app; see
ml/README.md and docs/INGREDIENT_MODEL_ROADMAP.md for that boundary.
"""

from __future__ import annotations

from src.utils.classes import ClassMap


def format_top_k(probabilities: list[float], class_map: ClassMap, k: int = 3) -> dict:
    if len(probabilities) != len(class_map):
        raise ValueError(
            f"Got {len(probabilities)} probabilities but the class map has {len(class_map)} classes."
        )
    if k < 1:
        raise ValueError(f"k must be >= 1, got {k}")

    ranked_indices = sorted(range(len(probabilities)), key=lambda i: probabilities[i], reverse=True)
    top_k = [
        {"class": class_map.label_of(i), "confidence": round(float(probabilities[i]), 4)}
        for i in ranked_indices[: min(k, len(probabilities))]
    ]
    best = top_k[0]
    return {"predicted_class": best["class"], "confidence": best["confidence"], "top_k": top_k}

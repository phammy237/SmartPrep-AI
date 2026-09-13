# Dataset Audit — v0 Real Dataset (interim)

Generated from an actual run of `scripts/acquire/fruits360.py` plus the
curation tools in `src/curation/`, against real, licensed images — not
projected or hypothetical numbers. Regenerate by re-running the commands in
"How to reproduce this audit" below.

**Verdict: NOT READY FOR TRAINING.** See "Quality gate result" at the bottom.

## What was acquired

| Source | Classes covered | License | Images | Groups | Acquired via |
|---|---|---|---|---|---|
| Fruits-360 (`fruits-360-100x100`, GitHub, `main` branch) | apple, banana, carrot | CC BY-SA 4.0 | 90 | 6 | `scripts/acquire/fruits360.py` |

No other class has any acquired or first-party image yet. **10 of 13 classes
have zero real images**: tomato, onion, potato, broccoli, spinach, egg, milk,
bread, chicken, cheese.

This is verified mechanically, not just by inspection: calling
`build_combined_manifest_rows` with the full 13-class `configs/classes.json`
against only this provenance source raises:

```
FileNotFoundError: No candidate images (first-party or acquired) found for
class(es) ['tomato', 'onion', 'potato', 'broccoli', 'spinach', 'egg', 'milk',
'bread', 'chicken', 'cheese']. Every class in configs/classes.json needs at
least one source - see data/README.md.
```

## Dataset statistics (the 3 acquired classes only)

```json
{
  "total_candidates": 90,
  "images_per_class": {"apple": 45, "banana": 30, "carrot": 15},
  "imbalance_ratio": 3.0,
  "source_distribution_per_class": {
    "apple": {"fruits360": 45},
    "banana": {"fruits360": 30},
    "carrot": {"fruits360": 15}
  },
  "dimensions": {
    "count": 90, "width_min": 100, "width_max": 100, "width_mean": 100.0,
    "height_min": 100, "height_max": 100, "height_mean": 100.0
  },
  "rejected_count": 0,
  "exact_duplicate_count": 0,
  "near_duplicate_count": 570,
  "split_counts": {"train": 60, "val": 15, "test": 15}
}
```

- **`rejected_count: 0`** — all 90 downloaded images passed
  `src/curation/validation.py` (readable, JPEG, 100x100 — within
  `MIN_DIMENSION`/`MAX_DIMENSION`).
- **`exact_duplicate_count: 0`** — no byte-identical files (SHA-256).
- **`near_duplicate_count: 570`** — expected and not a defect: these are
  turntable frames of the same handful of physical fruit specimens,
  perceptually near-identical by design. What matters is where they fall
  relative to split boundaries (see leakage audit below), not that they
  exist at all.
- **`imbalance_ratio: 3.0`** (apple 45 vs. carrot 15) — mild, would not block
  training on its own.
- All images are uniformly 100x100 — Fruits-360's own fixed export
  resolution, not a resize choice made here.

## Leakage audit (`src/curation/leakage.py::audit_manifest_leakage`)

```json
{
  "group_split_violations": {},
  "cross_split_exact_duplicates": 0,
  "cross_split_near_duplicates": 0
}
```

All three checks pass clean: every group (one per Fruits-360 variety folder)
landed entirely within one split, and no image content leaked across a split
boundary. **Leakage prevention is architecturally sound** on this data.

## The actual blocker: per-class split coverage, not leakage

Leakage prevention passing is necessary but not sufficient — a leakage-safe
split can still be *unusable* if a class has too few independent groups to
populate all three splits. That is exactly what happened here:

| Class | Groups (varieties) | train | val | test |
|---|---|---|---|---|
| apple | 3 | 30 | 15 | **0** |
| banana | 2 | 30 | **0** | **0** |
| carrot | 1 | **0** | **0** | 15 |

With `split_groups` allocating whole groups (never individual images) to
train/val/test at a 70/15/15 ratio, and only 1–3 groups per class to
allocate, the rounding has nowhere good to go:
- **apple** (3 groups) → 2 groups landed in train, 1 in val, 0 in test.
  **Zero test images for apple.**
- **banana** (2 groups) → both groups landed in train. **Zero val or test
  images for banana.**
- **carrot** (1 group — Fruits-360 has only one carrot variety at all) →
  the entire class is one group, so by construction it can only ever occupy
  a single split. Here that's test. **Zero train or val images for carrot —
  it cannot be trained on OR validated on at all from this source alone.**

**Root cause:** group-based (leakage-safe) splitting requires each class to
have *enough distinct groups* to spread across train/val/test — not enough
*images*. Fruits-360 gives us only 1–3 varieties (= physical specimens) per
class among our 3 covered classes; that is too few groups for a meaningful
3-way split, no matter how many turntable frames each variety has. More
images from the *same* physical specimen do not fix this — only more
*distinct* specimens (more varieties, more first-party photos of different
physical items) do.

**This is a real, structural finding, not a bug in the splitting code**:
the same code (`assign_splits`/`split_groups`) is exercised by 13 passing
unit tests using synthetic multi-group fixtures and works correctly there.
The problem is this specific source's low variety count for these classes,
not the mechanism.

## Domain-diversity audit

Every one of the 90 acquired images shares the same domain: a single fruit,
centered, on a plain uniform background, studio turntable lighting, fixed
100x100 export resolution. This is **not representative of SmartPrep's real
Scan input** (cluttered fridge/pantry photos, phone camera, variable
lighting, partial occlusion, multiple items in frame). Fruits-360 is useful
only as an early pipeline sanity-check signal, never as a stand-in for
production-realistic data — consistent with the domain-mismatch note already
in `data/README.md`'s source table.

## Quality gate result

Per the pre-training quality gate (all conditions must hold):

| Gate | Result |
|---|---|
| Every class in `configs/classes.json` has ≥1 real image | ❌ FAIL — 10/13 classes have zero |
| Every class has enough distinct groups for a 3-way split | ❌ FAIL — even the 3 covered classes don't |
| No group split across train/val/test | ✅ PASS |
| No cross-split exact/near duplicate | ✅ PASS |
| No corrupt/unreadable/wrong-format images | ✅ PASS |
| Domain diversity adequate for target use case | ❌ FAIL — single-domain, studio-only |

**Overall: NOT READY FOR TRAINING.** Do not start a training run against
this dataset. See `data/README.md` for what is required to close each gap
(per-class source strategy, realistic targets, first-party collection plan).

## How to reproduce this audit

```bash
cd ml
python scripts/acquire/fruits360.py         # idempotent; re-run is a no-op if files exist
python -m pytest -q                         # 112 tests, no network required
```

Then the ad-hoc statistics/leakage commands used to produce the JSON above
call `src.curation.statistics.build_dataset_statistics` and
`src.curation.leakage.audit_manifest_leakage` against
`src.datasets.manifest.build_combined_manifest_rows(..., acquired_provenance_paths=["data/provenance/fruits360.csv"])`
— no standalone script wraps this yet since only one real source exists so
far; once more sources are acquired this should become a proper
`scripts/audit_dataset.py` (not built yet, deliberately, to avoid
prematurely designing around still-hypothetical class coverage).

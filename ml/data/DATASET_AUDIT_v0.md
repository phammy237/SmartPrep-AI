# Dataset Audit — v0 Real Dataset (interim)

Generated from actual runs of `scripts/acquire/fruits360.py` and
`scripts/acquire/banglavegnet.py`, plus the curation tools in
`src/curation/`, against real, licensed images — not projected or
hypothetical numbers. Regenerate by re-running the commands in "How to
reproduce this audit" below.

**Verdict: NOT READY FOR TRAINING.** See "Quality gate result" at the bottom.

## What was acquired

| Source | Classes covered | License | Images | Groups | Acquired via |
|---|---|---|---|---|---|
| Fruits-360 (`fruits-360-100x100`, GitHub, `main` branch) | apple, banana, carrot | CC BY-SA 4.0 | 90 | 6 | `scripts/acquire/fruits360.py` |
| BanglaVegNet (Mendeley, DOI `10.17632/rtx9ngb68j.2`) | tomato, onion, potato, broccoli, spinach (targeted) | CC BY 4.0 | **0 — acquisition blocked, see below** | — | `scripts/acquire/banglavegnet.py` |

No other class has any acquired or first-party image yet. **10 of 13 classes
have zero real images**: tomato, onion, potato, broccoli, spinach, egg, milk,
bread, chicken, cheese — unchanged from before this pass, because
BanglaVegNet acquisition could not complete (see next section).

This is verified mechanically, not just by inspection: calling
`build_combined_manifest_rows` with the full 13-class `configs/classes.json`
against both provenance sources still raises:

```
FileNotFoundError: No candidate images (first-party or acquired) found for
class(es) ['tomato', 'onion', 'potato', 'broccoli', 'spinach', 'egg', 'milk',
'bread', 'chicken', 'cheese']. Every class in configs/classes.json needs at
least one source - see data/README.md.
```

## BanglaVegNet acquisition status: BLOCKED — documented manual step, not bypassed

Per this task's instruction ("If the downloadable organization does not
match the published description, STOP and report rather than guessing" /
"If Mendeley requires manual download or has a download mechanism unsuitable
for clean scripted acquisition, document the manual step instead of
bypassing it"), this is exactly what happened.

**Verified against the official source (Mendeley Data, DOI
`10.17632/rtx9ngb68j.2`, checked 2026-09-13):**
- Title: "A Comprehensive Image Dataset of Vegetables Grown in Bangladesh"
  (this same dataset record's v1 was titled "BanglaVegNet: A Multiclass
  Image Dataset of Traditional Vegetables in Bangladesh" — same DOI base,
  renamed at v2. The user-supplied name "BanglaVegNet" and DOI both refer to
  this one record.)
- Authors: Rabeya Bashri Sumona, John Pritom Biswas, Md Ashiqur Rahman,
  Mamun Hasan, Sudipto Chaki (Bangladesh University of Business and
  Technology).
- License: CC BY 4.0 (confirmed via Mendeley's own dataset metadata API).
- 42 vegetable categories, 4,730 JPG images total per the published
  description; the file-listing API's own total count reads 3,754 — a
  discrepancy between the description and the API's own count, noted here
  rather than silently reconciled or guessed at.
- **Folder structure — confirmed accurate** for the 4 classes reachable
  (see below): each class is split into exactly two folders of **matching
  image count** — one of large files (raw, several MB/image) and one of
  small files (~10–15KB/image). Same count in both folders, in every class
  checked (Arum Lobe 13/13, Ash Gourd 10/10, Beetroot 15/15, Bitter Melon
  12/12) — strong evidence the "processed" folder is a resized/recompressed
  copy of the same raw originals, not additional distinct images. Per the
  "prefer raw, skip resized/duplicated derivatives" instruction, the
  acquisition script only ever requests the raw folder.

**What could not be verified or acquired, and why:** the dataset's public
file-listing API (`GET
https://data.mendeley.com/api/datasets/rtx9ngb68j/files?version=2`) hard-caps
the unscoped (whole-dataset) listing at **100 results**
(`content-range: items 0-99/3754`), which — sorted alphabetically by
filename — only reaches through the 4th of 42 classes ("Bitter Melon").
Every plausible override was tried and none worked (all silently ignored,
returning the identical first 100 items, or rejected with 400):
`offset`/`limit`/`skip`/`take`/`page`/`per_page`/`marker`/`_start`/`_end`
query parameters in several naming conventions; standard and
Mendeley-specific `Range: items=100-199` / `Range-Unit: items` headers;
`sort`/`reverse`/`order` parameters; `folder_id=root`/`""`/`null`; an
alternate `/api/v2/` path; path-embedded version numbers. Querying a
**known** `folder_id` directly works perfectly and returns complete, correct
results (e.g. `folder_id=d0e35ba4-...` correctly reports
`items 0-12/13` — all 13 Arum Lobe raw files). The only unresolved piece is
**discovering the folder_id for each of Broccoli/Onion/Potato/Tomato/Green
Spinach's raw folders** — they fall well past the reachable first 100 items,
and no folder-name→folder_id lookup endpoint was discoverable without
executing the dataset page's client-side Angular app (this environment has
no headless browser to do that).

**Resolution — the one documented manual step** (not bypassed by guessing
or by falling back to a Kaggle mirror): a human opens
`https://data.mendeley.com/datasets/rtx9ngb68j/2/files` in a real browser,
opens DevTools → Network, filters on `files?version=2`, clicks into each
target class's **raw** sub-folder in the file browser UI, and copies that
request's `folder_id` (a UUID) into
`ml/scripts/acquire/banglavegnet_folders.json` (see that file's own
`_readme` field for the exact steps). Everything after that — listing,
downloading, validating, near-duplicate-based grouping, provenance,
idempotent re-runs — is already fully built and tested
(`tests/test_acquire_banglavegnet.py`, 7 tests, no network) and requires no
further code changes once the 5 folder_ids are filled in. Running the script
today (with all 5 still unconfigured) produces, correctly:

```
[not configured - no folder_id_raw set, nothing guessed] ['broccoli', 'onion', 'potato', 'spinach', 'tomato']
No candidates acquired ... Not writing an empty provenance CSV over a possibly-real one
```

The script also has a **built-in structural safety check** for when folder
ids are filled in: if a configured folder's files average under 200KB, it
aborts that class rather than silently ingesting the processed/compressed
subset by mistake (tested in
`test_raw_vs_processed_filtering_aborts_on_small_average_file_size`).

## Optional backup dataset — research only, not acquired (task's own instruction)

**Vegetable Image Dataset for Classification Models: A Bangladeshi
Perspective** — verified via Mendeley Data (checked 2026-09-13):
- DOI: `10.17632/b9rvg4f2st.4` (version 4).
- Authors: Md Jobayer Ahmed, Ratu Saha, Arpon Kishore Dutta, Mayen Uddin
  Mojumdar.
- License: CC BY 4.0.
- 4,319 raw images, 12 vegetable classes, captured with mobile phone
  cameras with natural (unmodified) backgrounds — includes **potato (365
  img), onion (357 img), tomato (329 img)** among our target classes.
  Simple per-class folder structure (no raw/processed split, per a related
  paper's description of a closely-related BUBT dataset lineage) — likely
  *easier* to acquire cleanly than BanglaVegNet if pursued.
- **Not acquired in this pass**, per the task's explicit instruction to
  research only. Worth acquiring later specifically because its "mobile
  phone, natural background" domain is a meaningfully different (and more
  SmartPrep-realistic) domain than either Fruits-360's studio turntable
  shots or BanglaVegNet's likely-similar market/isolated photography — see
  "Domain-diversity audit" below.

## Dataset statistics (the 3 acquired classes only — unchanged from before this pass)

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
boundary. **Leakage prevention is architecturally sound** on this data —
and, separately, on synthetic BanglaVegNet-shaped candidates whose groups
come from near-duplicate clustering instead of folder metadata
(`test_no_cross_split_group_leakage_for_banglavegnet_shaped_candidates`).

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
physical items) do. The same risk applies to BanglaVegNet once acquired:
with no specimen metadata, its effective group count depends entirely on
how many visually-distinct near-duplicate clusters the 5 target classes
actually contain — unknown until real images are downloaded, which is
exactly why the audit must be re-run for real once the manual folder_id
step is done, not assumed favorable in advance.

**This is a real, structural finding, not a bug in the splitting code**:
the same code (`assign_splits`/`split_groups`) is exercised by unit tests
using synthetic multi-group fixtures and works correctly there. The problem
is this specific source's low variety count for these classes, not the
mechanism.

## Domain-diversity audit

Every one of the 90 acquired images shares the same domain: a single fruit,
centered, on a plain uniform background, studio turntable lighting, fixed
100x100 export resolution. This is **not representative of SmartPrep's real
Scan input** (cluttered fridge/pantry photos, phone camera, variable
lighting, partial occlusion, multiple items in frame). Fruits-360 is useful
only as an early pipeline sanity-check signal, never as a stand-in for
production-realistic data. BanglaVegNet's own description ("market/isolated
vegetable photos") suggests a similar, though not identical, domain gap once
acquired — still not fridge/pantry/countertop imagery. The backup dataset
researched above (mobile-phone, natural background) is the closest of the
three to SmartPrep's real domain, but was deliberately not acquired this
pass. **Every class remains without any SmartPrep-realistic (fridge/pantry/
countertop/grocery-bag/clutter) imagery** — first-party photography is the
only path to closing this gap; see `data/README.md`'s collection plan.

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
(per-class source strategy, realistic targets, first-party collection plan,
and the one manual step needed to unblock BanglaVegNet).

## How to reproduce this audit

```bash
cd ml
python scripts/acquire/fruits360.py         # idempotent; re-run is a no-op if files exist
python scripts/acquire/banglavegnet.py      # currently a no-op: see 'BanglaVegNet acquisition status' above
python -m pytest -q                         # all tests, no network required
```

Then the ad-hoc statistics/leakage commands used to produce the JSON above
call `src.curation.statistics.build_dataset_statistics` and
`src.curation.leakage.audit_manifest_leakage` against
`src.datasets.manifest.build_combined_manifest_rows(..., acquired_provenance_paths=["data/provenance/fruits360.csv", "data/provenance/banglavegnet.csv"])`
— no standalone script wraps this yet since class coverage is still
changing between passes; once BanglaVegNet's manual step is done this should
become a proper `scripts/audit_dataset.py` (not built yet, deliberately, to
avoid prematurely designing around still-hypothetical class coverage).

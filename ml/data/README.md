# Data

No dataset is checked into this repository. `raw/`, `raw_acquired/`,
`processed/`, `splits/`, and `first_party_inbox/` are gitignored (see
`ml/.gitignore`) and currently contain nothing but a `.gitkeep` placeholder
each (plus, locally, whatever `scripts/acquire/*.py` has actually
downloaded into `raw_acquired/` — those files exist on disk but are never
committed).

**Current real-dataset status (2026-09-13): NOT READY FOR TRAINING. READY
FOR FIRST-PARTY COLLECTION.** 7 of 13 classes now have real, licensed
images (apple, banana, carrot, potato, onion, tomato, spinach); 6 have
zero (broccoli, egg, milk, bread, chicken, cheese). See
`data/DATASET_AUDIT_v0.md` for the full, mechanically-generated audit (real
numbers, not projected — reproduce it any time with
`python scripts/audit_dataset.py`) and
`data/FIRST_PARTY_COLLECTION_GUIDE.md` for the concrete, sized-per-class
plan to close what's left.

## Expected raw-data layout

```text
data/raw/
  apple/*.jpg|png
  banana/*.jpg|png
  tomato/*.jpg|png
  onion/*.jpg|png
  potato/*.jpg|png
  carrot/*.jpg|png
  broccoli/*.jpg|png
  spinach/*.jpg|png
  egg/*.jpg|png
  milk/*.jpg|png
  bread/*.jpg|png
  chicken/*.jpg|png
  cheese/*.jpg|png
```

One subdirectory per class, matching `ml/configs/classes.json` **exactly**
(name and set - `scripts/make_manifest.py` / `src/training/train.py` raise a
clear error if a class directory is missing or empty, rather than silently
training on 12 classes instead of 13). This is for **first-party** photos
only; third-party acquired images live under `data/raw_acquired/<source>/`
instead and are indexed through a provenance CSV, not this directory
convention — see "Acquired (third-party) images" below.

Each image should show **one primary ingredient** (see the ambiguity
assumptions documented in `ml/src/utils/classes.py`) - v0 is a whole-image
classifier, not a detector; an image with several ingredients has no single
correct label and should not go in the v0 dataset.

## Getting first-party photos into this layout

**Don't hand-build this folder or a manifest row by hand.** Follow
`data/FIRST_PARTY_COLLECTION_GUIDE.md` to take photos, drop them into
`data/first_party_inbox/<class>/`, then run:

```bash
cd ml
python scripts/import_first_party.py
```

which validates, deduplicates, and copies them into `data/raw/<class>/`
with groups derived from the guide's filename convention
(`fp_<class>_<specimen>_<session>_<index>.jpg`). See that script's own
docstring (`ml/scripts/import_first_party.py`) for exactly what it checks.

## Acquired (third-party) images

Scripts under `ml/scripts/acquire/` download real, licensed images from a
specific, verified, official source and write a provenance CSV to
`data/provenance/<source>.csv` via `src/datasets/manifest.py::write_candidates_csv`.
Every row carries machine-readable provenance — never license/attribution
recorded only in prose:

```text
path,label,source_label,group,source_dataset,source_url,license,original_id,first_party
data/raw_acquired/fruits360/apple/fruits360_Apple_Braeburn_1_0_100.jpg,apple,Apple,fruits360:apple:Apple Braeburn 1,fruits360,https://github.com/fruits-360/fruits-360-100x100/blob/main/Training/Apple%20Braeburn%201/0_100.jpg,CC BY-SA 4.0,0_100.jpg,False
```

`source_label` is the class name AS THE SOURCE DATASET ITSELF calls it —
kept distinct from `label` (SmartPrep's taxonomy) whenever an acquisition
script maps a source category onto a different SmartPrep class. Never
assume `source_label == label` just because a particular source happens not
to need a rename.

Properties every acquisition script must have (enforced by
`tests/test_acquire_fruits360.py` as the template for future scripts):

- **Idempotent / never overwrites**: re-running skips any file already
  present on disk; only missing files are downloaded.
- **No credentials**: every source used must be fetchable anonymously via
  its own official, documented API/CDN. If a dataset requires an account,
  API key, or agreeing to per-download terms, it does not belong in an
  unattended script — acquire it manually and document the terms instead.
- **No scraping**: only official dataset distribution endpoints (a
  documented API, an official releases/CDN URL, or an official ZIP archive)
  — never Google Images/Pinterest/retailer/recipe-site scraping, and never
  a Kaggle reupload when the original source is directly reachable.
- **Relative, portable paths**: the provenance CSV stores paths relative to
  `ml/` (no local username/absolute path embedded), since the CSV — unlike
  the images themselves — is meant to be committed. This includes `group`
  values that come from clustering (see below) - a group id derived from an
  absolute local path would leak machine-specific details into a
  committable file.
- **Bounded per-group sampling**: where a source's own structure allows it,
  an acquisition script pulls at most a small, fixed number of images per
  real-world group rather than every available frame — see "Grouping"
  under Fruits-360 below for why.

Committed for each acquired source: the acquisition script itself and the
provenance CSV (`data/provenance/<source>.csv` — small, no image bytes).
**Never committed:** the downloaded image files
(`data/raw_acquired/<source>/`, gitignored).

### Fruits-360

- **Script:** `scripts/acquire/fruits360.py`
- **Official source (verified 2026-09-12):** https://github.com/fruits-360/fruits-360-100x100
  (`main` branch). Fetched via the GitHub Contents API (directory listing) +
  `raw.githubusercontent.com` (file bytes) — not a git clone, not the
  Kaggle reupload.
- **License:** CC BY-SA 4.0. Commercial use, redistribution, and derivative
  works (including a trained model) are permitted, **but ShareAlike
  applies**: if a model trained partly on this data is itself
  redistributed, there is a plausible argument the model inherits a
  share-alike obligation. **Not resolved with a lawyer** — flagged
  explicitly. Do not ship a production model trained on this data without
  that legal check.
- **Classes actually covered, verified directly (not a secondhand
  summary):** apple, banana, carrot only.
- **Grouping:** every image in one variety folder (e.g. `Apple Golden 1`) is
  a turntable rotation frame of the same few physical specimens. Each
  variety folder is ONE group (`fruits360:<class>:<variety>`). The script
  samples at most 15 frames per variety.
- **Result of actually running it:** 90 images across 6 groups (3 apple
  varieties, 2 banana varieties, 1 carrot variety) — too few *groups* per
  class for a usable 3-way split, independent of image count. See
  `data/DATASET_AUDIT_v0.md`.

### Vegetable Image Dataset for Classification Models: A Bangladeshi Perspective

- **Script:** `scripts/acquire/bangladeshi_vegetables.py`
- **Official source (verified 2026-09-13):** Mendeley Data, DOI
  `10.17632/b9rvg4f2st.4`. Authors: Md Jobayer Ahmed, Ratu Saha, Arpon
  Kishore Dutta, Mayen Uddin Mojumdar.
- **License:** CC BY 4.0 (attribution only, no ShareAlike).
- **Target classes acquired:** potato, onion, tomato (of 12 total in the
  archive — the other 9 aren't SmartPrep classes and weren't downloaded).
- **How it's fetched:** the whole dataset is one official ~2GB ZIP.
  Downloading it in full just to keep 3 classes would be wasteful, so this
  script instead reads the ZIP's central directory via a few small HTTP
  Range requests (~540KB), confirms each target class's files sit in one
  contiguous byte span, and fetches each class's whole span in ONE Range
  GET (~140-150MB) — then extracts individual files with a small
  dependency-free ZIP-local-header parser that verifies every file's CRC32
  before trusting it. See the script's own docstring for the full mechanism
  and exactly why the naive `zipfile` + generic HTTP-range-file approach
  would have been far slower (one tiny HTTP request per internal read
  otherwise).
- **Result of actually running it:** 1,051 images across 99 groups —
  potato 365 img/57 groups, onion 357 img/11 groups, tomato 329 img/31
  groups. Every one of these three classes now clears the "all three
  splits non-empty" bar (see `DATASET_AUDIT_v0.md`).
- **A real exact-duplicate pair was found in the source archive itself**
  (two identically-named-but-suffixed tomato files, byte-identical) —
  correctly detected and correctly clustered into one group; documented in
  `DATASET_AUDIT_v0.md` rather than silently ignored.
- **Grouping:** no specimen/session metadata in the source at all (just
  sequential camera filenames) — grouped via
  `src.curation.duplicates.cluster_near_duplicates` (see below), same
  mechanism as every other source without real grouping metadata.

### An image dataset for classification of vegetable (supplemental spinach)

- **Script:** `scripts/acquire/vegetable_leaf_spinach.py`
- **Official source (verified 2026-09-13):** Mendeley Data, DOI
  `10.17632/9c7crxrvmf.1`. Authors: Suzana Sowket Gohona, Afsana Mimi,
  Mohammad Manzurul Islam (East West University).
- **License:** CC BY 4.0.
- **What it is:** a small (~9MB) official ZIP of 6 winter-vegetable LEAF
  classes; only `spinach` (109 images) was acquired.
- **Domain caveat — read before assuming this covers spinach:** these are
  leaf close-up photos (leaf-classification framing), **not** whole
  spinach bunches/bags as they'd appear in a fridge or grocery bag. This
  does NOT close spinach's domain gap — first-party photography of actual
  spinach bunches/bags is still required (Tier D in
  `data/FIRST_PARTY_COLLECTION_GUIDE.md`).
- **Result of actually running it:** 109 images across 17 groups.

### BanglaVegNet — deferred, not removed

- **Script:** `scripts/acquire/banglavegnet.py` (dormant — no longer on the
  critical path, per explicit instruction to stop investing time in its
  folder-UUID discovery problem).
- **Official source:** Mendeley Data, DOI `10.17632/rtx9ngb68j.2`. CC BY
  4.0. Targeted tomato, onion, potato, broccoli, and Green Spinach →
  SmartPrep's `spinach`.
- **Why it's dormant, not deleted:** the dataset's public file-listing API
  hard-caps its unscoped listing at 100 results, and no way to discover the
  folder_id for classes beyond the alphabetically-first few was found
  short of running the dataset's client-side Angular app (no headless
  browser in this environment) — see `DATASET_AUDIT_v0.md`'s prior-pass
  investigation for the full list of ~20 pagination approaches tried.
  Rather than continuing to spend time on that, the three classes it would
  have covered (tomato/onion/potato) were acquired from the Bangladeshi
  Perspective dataset instead — see above. Broccoli and the "real"
  (non-leaf) spinach domain gap remain open regardless of BanglaVegNet's
  status.
- **Fully preserved and still tested** (`tests/test_acquire_banglavegnet.py`,
  7 tests, no network) in case someone later supplies the 5 folder_ids (see
  `scripts/acquire/banglavegnet_folders.json`'s `_readme`) — needs zero
  code changes to run at that point.

### Broccoli — researched, explicitly not acquired

Two candidate public sources were checked and rejected:

- **"Field-Acquired RGB-Depth Image Dataset for Baby Broccoli Detection..."**
  (Mendeley, CC BY 4.0) — agricultural FIELD imagery (broccoli plants
  growing in soil, shot from a mobile farm platform), not grocery/fridge
  produce. A categorically different visual task. Not used, per the task's
  explicit instruction not to make field-crop imagery a primary broccoli
  source without flagging the mismatch (flagged here).
- **"Comprehensive Vegetable Leaf Disease Image Collection"** (Mendeley,
  DOI `10.17632/rh8c5tgg5k.1`, CC BY 4.0) — broccoli LEAF DISEASE images,
  and doesn't include spinach either (checked as a candidate spinach source
  too). Not used.

Broccoli remains a zero-data class — first-party photography is its
primary source (Tier A in the collection guide).

## The manifest

`src/datasets/manifest.py` builds a manifest at `splits/manifest.csv` two
ways:

- `build_manifest_rows` / `build_or_load_manifest` — **first-party only**:
  scans `raw/<class>/`, requires every class to have a first-party
  subdirectory.
- `build_combined_manifest_rows` / `build_or_load_combined_manifest` — the
  real path for v0: merges first-party photos (if any) with one or more
  acquired-source provenance CSVs into one candidate pool, then assigns
  splits over the **union**, so a group is never scattered across splits
  just because its images came from different sources. Raises
  `FileNotFoundError` naming every class with zero candidates from any
  source — this is what currently fires for broccoli, egg, milk, bread,
  chicken, cheese (see `DATASET_AUDIT_v0.md`).

```text
path,label,source_label,split,group,source_dataset,source_url,license,original_id,first_party
data/raw/spinach/fp_spinach_02_kitchen-day1_01.jpg,spinach,,train,fp_spinach_02_kitchen-day1,first_party,,,fp_spinach_02_kitchen-day1_01.jpg,True
data/raw_acquired/bangladeshi_vegetables/potato/bangladeshi_veg_IMG_0357.JPG,potato,Potato,val,data/raw_acquired/bangladeshi_vegetables/potato/bangladeshi_veg_IMG_0357.JPG,bangladeshi_vegetables,https://data.mendeley.com/datasets/b9rvg4f2st/4,CC BY 4.0,bangladeshi_veg_IMG_0357.JPG,False
```

- `group` exists to keep near-duplicate images (e.g. several photos from the
  same capture session, the same turntable variety, or - for sources with
  no real grouping metadata - the same near-duplicate cluster) in the SAME
  split. See `default_group_key` (first-party filename heuristic, used by
  `scripts/import_first_party.py`) vs.
  `src.curation.duplicates.cluster_near_duplicates` (conservative
  visual-similarity clustering, used by `bangladeshi_vegetables.py`,
  `vegetable_leaf_spinach.py`, and dormant `banglavegnet.py`).
- **Splitting is stratified PER CLASS**, not pooled globally —
  `assign_splits` shuffles and splits each label's own groups
  independently. This was a real bug fixed during this phase: pooling every
  class's groups into one shuffle let a class's actual split ratio drift
  based on how many groups OTHER classes happened to contribute, which only
  became visible once a real multi-source, wildly-uneven-group-count
  dataset existed (see `DATASET_AUDIT_v0.md`, "Split stratification fix").
- Once a manifest exists at `manifest_path`, it is **not** regenerated on the
  next training run unless `force_resplit: true` is set — deliberate, so
  the train/val/test assignment for a given snapshot stays fixed across
  experiments.
- **Leakage auditing** (`src/curation/leakage.py::audit_manifest_leakage`)
  is a separate, independent check run AFTER a manifest is built. Its
  near-duplicate check only ever compares images of the SAME label — two
  different ingredient classes can never be the same physical specimen no
  matter how visually similar a coarse hash finds them (this was also found
  and fixed on real data - see `DATASET_AUDIT_v0.md`).

## NO augmentation before splitting (explicit)

Original, unaugmented images are what gets assigned to train/val/test —
`assign_splits` operates on real acquired/first-party files only. Data
augmentation (`src/datasets/transforms.py::build_train_transform`) is
applied **dynamically, in memory, at `__getitem__` time**, only to samples
already assigned to the *train* split, and is never applied to val/test.
No augmented copy of any image is ever written to disk, and no augmented
image is ever a candidate for splitting.

## Realistic dataset targets

| | Minimum viable (v0 sanity check) | Preferred (defensible v0 baseline) |
|---|---|---|
| Images per class | ~60–100, spread across ≥4 distinct groups | 200–400, spread across ≥8–10 distinct groups |
| Groups per class | ≥4 (so a 70/15/15 group split can put ≥1 group in each of val/test) | ≥8–10 |
| Domains represented | at least 2 | 3+ (varied backgrounds, lighting, packaging, devices) |
| Class balance | within ~3-5x (imbalance_ratio ≤ ~5) | within ~2x |

These are about **diversity and group count**, not raw image count — potato
now has 365 images/57 groups from public data alone, comfortably clearing
"preferred"; carrot has 15 images but only 1 group, failing even "minimum
viable" despite having some images at all.

## Per-class source strategy (current, real)

| Class | Status | Public source(s) | First-party need |
|---|---|---|---|
| apple | 45 img / 3 groups (fails minimum) | Fruits-360 | Add groups (Tier B) |
| banana | 30 img / 2 groups (fails minimum) | Fruits-360 | Add groups (Tier B) |
| carrot | 15 img / 1 group (fails minimum) | Fruits-360 | Add groups (Tier B) |
| tomato | 329 img / 31 groups (OK) | Bangladeshi Perspective dataset | Domain only (Tier C) |
| onion | 357 img / 11 groups (OK) | Bangladeshi Perspective dataset | Domain only (Tier C) |
| potato | 365 img / 57 groups (OK) | Bangladeshi Perspective dataset | Domain only (Tier C) |
| spinach | 109 img / 17 groups (OK on splits, leaf-domain only) | vegetable-leaf dataset (supplemental) | Real grocery domain (Tier D) |
| broccoli | 0 img (no data) | none (2 candidates researched, rejected - see above) | Primary source (Tier A) |
| egg | 0 img (no data) | none identified | Primary source (Tier A) |
| milk | 0 img (no data) | none identified | Primary source (Tier A) |
| bread | 0 img (no data) | none identified | Primary source (Tier A) |
| chicken | 0 img (no data) | none identified (raw meat packaging poorly covered by general datasets) | Primary source (Tier A) |
| cheese | 0 img (no data) | none identified | Primary source (Tier A) |

**Open Images V7** was evaluated and excluded from scripted acquisition:
Google's own dataset page carries an explicit "you must verify each image's
individual license yourself" disclaimer, failing this project's
"if licensing is unclear, do not use it" bar for an *unattended* script.

## First-party collection plan

See **`data/FIRST_PARTY_COLLECTION_GUIDE.md`** — a complete, practical
guide sized per class based on the real public-data status above (4 tiers,
from "primary source" for the 6 zero-data classes down to "small domain
supplement" for potato/onion/tomato, which already have plenty of public
groups). Total realistic target: **~330-480 photos across all 13 classes**,
spread over 4-6 sessions — not thousands of photos.

Bring photos in with `scripts/import_first_party.py` (see above), then
re-check with `scripts/audit_dataset.py`.

## Domain-diversity audit

**Zero of SmartPrep's 13 classes currently have any SmartPrep-realistic
(fridge/pantry/countertop/grocery-bag/cluttered) imagery.** Every source
acquired so far is single-domain in its own way (studio turntable, market/
mobile-phone produce shots, or leaf close-ups) — see
`data/DATASET_AUDIT_v0.md`'s domain-diversity section for the full
breakdown per source. First-party data (the guide above) is the only path
to closing this gap.

## Dataset candidates researched

| Dataset | Source | License (verified) | Relevant classes | Redistribution / derivative use | Known domain mismatch | Date checked | Acquired? |
|---|---|---|---|---|---|---|---|
| Fruits-360 (`fruits-360-100x100`) | GitHub | CC BY-SA 4.0 | apple, banana, carrot | Yes, with attribution + ShareAlike (unresolved legal caveat, see above) | Studio turntable, plain white background | 2026-09-12 | Yes |
| Vegetable Image Dataset ... A Bangladeshi Perspective | Mendeley, DOI `10.17632/b9rvg4f2st.4` | CC BY 4.0 | potato, onion, tomato | Yes, with attribution | Mobile-phone "market/isolated produce" style, not fridge/pantry | 2026-09-13 | Yes |
| An image dataset for classification of vegetable | Mendeley, DOI `10.17632/9c7crxrvmf.1` | CC BY 4.0 | spinach (leaf-domain, supplemental) | Yes, with attribution | Leaf close-ups, not whole produce | 2026-09-13 | Yes (spinach only) |
| BanglaVegNet / A Comprehensive Image Dataset of Vegetables Grown in Bangladesh | Mendeley, DOI `10.17632/rtx9ngb68j.2` | CC BY 4.0 | tomato, onion, potato, broccoli, spinach | Yes, with attribution | Market/isolated produce (not directly observed - acquisition blocked) | 2026-09-13 | No — dormant, see above |
| Field-Acquired RGB-Depth Baby Broccoli dataset | Mendeley | CC BY 4.0 | broccoli | N/A - not used | Agricultural field imagery, plants in soil - wrong task entirely | 2026-09-13 | No |
| Comprehensive Vegetable Leaf Disease Image Collection | Mendeley, DOI `10.17632/rh8c5tgg5k.1` | CC BY 4.0 | broccoli (leaf disease only) | N/A - not used | Leaf disease close-ups, not whole heads; no spinach | 2026-09-13 | No |
| Open Images Dataset (V7) | Google | Per-image, no blanket license | Most of our 13 classes | Only with per-image verification | Mixed | 2026-09-12 | No |
| Food-101 | ETH Zurich | Academic/research use | None (prepared dishes) | Check terms | Wrong problem entirely | Previously researched | No |
| USDA / public-domain produce photography | Varies | Often public domain | Most produce classes | Yes if genuinely public domain | Idealized/studio | Previously researched | No |

## User data policy (explicit)

**User-uploaded Scan photos may NOT be used for training without explicit,
informed, opt-in consent and a published data-use policy.** No such consent
flow or policy exists yet. Nothing in this workspace reads from or writes to
the mobile app's Supabase project, and nothing here should be wired up to do
so until that policy exists - this is a product and legal decision, not a
technical default this workspace sets on its own.

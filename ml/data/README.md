# Data

No dataset is checked into this repository. `raw/`, `raw_acquired/`,
`processed/`, and `splits/` are gitignored (see `ml/.gitignore`) and
currently contain nothing but a `.gitkeep` placeholder each (plus, locally,
whatever `scripts/acquire/*.py` has actually downloaded into
`raw_acquired/` — those files exist on disk but are never committed).

**Current real-dataset status (2026-09-12): NOT READY FOR TRAINING.** Only
3 of 13 classes (apple, banana, carrot) have any real, licensed images, and
even those three fail the per-class split-coverage gate. See
`data/DATASET_AUDIT_v0.md` for the full, mechanically-generated audit (real
numbers, not projected) and exactly what's missing.

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

## Acquired (third-party) images

Scripts under `ml/scripts/acquire/` download real, licensed images from a
specific, verified, official source and write a provenance CSV to
`data/provenance/<source>.csv` via `src/datasets/manifest.py::write_candidates_csv`.
Every row carries machine-readable provenance — never license/attribution
recorded only in prose:

```text
path,label,group,source_dataset,source_url,license,original_id,first_party
data/raw_acquired/fruits360/apple/fruits360_Apple_Braeburn_1_0_100.jpg,apple,fruits360:apple:Apple Braeburn 1,fruits360,https://github.com/fruits-360/fruits-360-100x100/blob/main/Training/Apple%20Braeburn%201/0_100.jpg,CC BY-SA 4.0,0_100.jpg,False
```

Properties every acquisition script must have (enforced by
`tests/test_acquire_fruits360.py` as the template for future scripts):

- **Idempotent / never overwrites**: re-running skips any file already
  present on disk; only missing files are downloaded.
- **No credentials**: every source used must be fetchable anonymously via
  its own official, documented API/CDN. If a dataset requires an account,
  API key, or agreeing to per-download terms, it does not belong in an
  unattended script — acquire it manually and document the terms instead.
- **No scraping**: only official dataset distribution endpoints (a
  documented API, an official releases/CDN URL) — never Google
  Images/Pinterest/retailer/recipe-site scraping, and never a Kaggle
  reupload when the original source is directly reachable.
- **Relative, portable paths**: the provenance CSV stores paths relative to
  `ml/` (no local username/absolute path embedded), since the CSV — unlike
  the images themselves — is meant to be committed.
- **Bounded per-group sampling**: an acquisition script pulls at most a
  small, fixed number of images per real-world group (e.g. per Fruits-360
  variety folder) rather than every available frame — see "Grouping" below
  for why.

Committed for each acquired source: the acquisition script itself and the
provenance CSV (`data/provenance/<source>.csv` — small, no image bytes).
**Never committed:** the downloaded image files
(`data/raw_acquired/<source>/`, gitignored).

### Fruits-360 (the only source acquired so far)

- **Script:** `scripts/acquire/fruits360.py`
- **Official source (verified 2026-09-12):** https://github.com/fruits-360/fruits-360-100x100
  (`main` branch — confirmed via `GET /repos/fruits-360/fruits-360-100x100`'s
  `default_branch` field; an earlier `?ref=master` guess 404'd). Fetched via
  the GitHub Contents API (directory listing) +
  `raw.githubusercontent.com` (file bytes) — not a git clone (avoids
  pulling the ~1.1GB full repo) and not the Kaggle reupload
  (kaggle.com/datasets/moltean/fruits), since the GitHub repo is the
  original, primary source.
- **License:** CC BY-SA 4.0, per that repo's own LICENSE file, checked at
  acquisition time. Commercial use, redistribution, and derivative works
  (including a trained model) are permitted, **but ShareAlike applies**: if
  a model trained partly on this data is itself redistributed, there is a
  plausible argument the model (as a derivative work) inherits a
  share-alike obligation. This has **not** been resolved with a lawyer —
  flagged here explicitly rather than assumed away. Do not ship a
  production model trained on this data without that legal check.
- **Classes actually covered by this repo, verified directly (not a
  secondhand summary):** apple, banana, carrot only. An earlier WebSearch
  summary claimed this repo also covered potato/tomato/onion — that was
  checked directly against the GitHub Contents API and found **false**; do
  not trust a secondhand dataset-coverage claim without verifying against
  the actual file listing.
- **Grouping:** every image in one variety folder (e.g. `Apple Golden 1`) is
  a turntable rotation frame of the same few physical specimens — a
  near-duplicate of every other frame in that folder, not an independent
  example. Each variety folder is therefore ONE group
  (`fruits360:<class>:<variety>`), which `assign_splits` keeps entirely
  within a single split. The script samples at most 15 frames per variety
  (`MAX_IMAGES_PER_VARIETY_DEFAULT`) rather than the full few hundred, since
  more frames of the same specimen add no independent information.
- **Result of actually running it:** 90 images across 6 groups (3 apple
  varieties, 2 banana varieties, 1 carrot variety). See
  `data/DATASET_AUDIT_v0.md` for why this is still not enough — too few
  *groups* per class for a usable 3-way split, independent of image count.

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
  source — this is what currently fires for the 10 classes with no real
  images at all (see `DATASET_AUDIT_v0.md`).

```text
path,label,split,group,source_dataset,source_url,license,original_id,first_party
data/raw/apple/apple_session1_01.jpg,apple,train,apple_session1,first_party,,,apple_session1_01.jpg,True
data/raw_acquired/fruits360/apple/fruits360_Apple_Braeburn_1_0_100.jpg,apple,val,fruits360:apple:Apple Braeburn 1,fruits360,https://github.com/...,CC BY-SA 4.0,0_100.jpg,False
```

- `group` exists to keep near-duplicate images (e.g. several photos from the
  same capture session, or the same turntable variety) in the SAME split —
  splitting happens on groups, never individual images. See
  `default_group_key` (first-party filename heuristic) vs. an acquisition
  script's own source-aware grouping (module docstring in `manifest.py` has
  the full rationale).
- Once a manifest exists at `manifest_path`, it is **not** regenerated on the
  next training run unless `force_resplit: true` is set in the config (or
  `scripts/make_manifest.py --force` is run directly) - this is deliberate,
  so the train/val/test assignment for a given dataset snapshot stays fixed
  across experiments.
- **Leakage auditing** (`src/curation/leakage.py::audit_manifest_leakage`)
  is a separate, independent check run AFTER a manifest is built — it
  re-derives group/split membership from the manifest itself and also
  catches a case grouping alone cannot: two different groups that happen to
  contain byte-identical or visually near-identical images. A manifest
  should only be trusted if this audit comes back clean.

## NO augmentation before splitting (explicit)

Original, unaugmented images are what gets assigned to train/val/test —
`assign_splits` operates on real acquired/first-party files only. Data
augmentation (`src/datasets/transforms.py::build_train_transform` —
horizontal flip, rotation, color jitter) is applied **dynamically, in
memory, at `__getitem__` time**, only to samples already assigned to the
*train* split (`src/datasets/ingredient_dataset.py`), and is never applied
to val/test (`build_eval_transform` is deterministic — resize + normalize
only, always). No augmented copy of any image is ever written to disk, and
no augmented image is ever a candidate for splitting — augmentation happens
strictly downstream of a split assignment that has already been finalized.
This is what prevents the classic leak where two augmented variants of the
same source photo end up on opposite sides of a split.

## Realistic dataset targets

| | Minimum viable (v0 sanity check) | Preferred (defensible v0 baseline) |
|---|---|---|
| Images per class | ~60–100, spread across ≥4 distinct groups (specimens/sessions) | 200–400, spread across ≥8–10 distinct groups |
| Groups per class | ≥4 (so a 70/15/15 group split can put ≥1 group in each of val/test) | ≥8–10 (so val/test aren't each riding on a single specimen) |
| Domains represented | at least 2 (e.g. one studio-style source + a handful of first-party photos) | 3+ (varied backgrounds, lighting, packaging states, devices) |
| Class balance | within ~3-5x of each other (imbalance_ratio ≤ ~5) | within ~2x |

These are deliberately about **diversity and group count**, not raw image
count — the audit above shows 45 apple images across only 3 groups is
*worse* for a usable split than 40 images across 8 groups would be. A class
that hits "minimum viable" is defensible for a v0 sanity-check training run
with an honest caveat about small val/test sets; "preferred" is what v0
should aim for before being called a real baseline.

## Per-class source strategy

| Class | Preferred source | Backup source | First-party needed? |
|---|---|---|---|
| apple | Fruits-360 (acquired: 45 img / 3 groups) | first-party photos to add groups | Yes — needs more groups, not more frames |
| banana | Fruits-360 (acquired: 30 img / 2 groups) | first-party photos to add groups | Yes — same reason |
| carrot | Fruits-360 (acquired: 15 img / 1 group) | first-party photos (this source alone is insufficient — 1 group total) | Yes, required — cannot be split at all from Fruits-360 alone |
| tomato | BanglaVegNet (Mendeley, CC BY 4.0) — evaluated, not yet acquired (open taxonomy/structure questions, see below) | first-party | Likely, to supplement |
| onion | BanglaVegNet — same status | first-party | Likely |
| broccoli | BanglaVegNet — same status | first-party | Likely |
| spinach | BanglaVegNet — same status | first-party | Likely |
| potato | No verified permissively-licensed source identified yet | first-party | Yes, primary source |
| egg | None identified | first-party (packaged carton + individual eggs) | Yes, primary source |
| milk | None identified | first-party (multiple cartons/brands, packaged) | Yes, primary source |
| bread | None identified | first-party (loaf, sliced, bagged) | Yes, primary source |
| chicken | None identified (raw meat packaging is poorly covered by general-purpose datasets, and food-safety/quality concerns make sourcing real photos harder) | first-party (packaged, raw, both if feasible) | Yes, primary source |
| cheese | None identified | first-party (block, sliced, packaged) | Yes, primary source |

**BanglaVegNet was deliberately NOT acquired in this pass** — it was
identified as CC BY 4.0 on Mendeley Data and covers tomato/onion/broccoli
among its classes, but its exact folder structure and per-class taxonomy
still need to be verified against the live dataset page before writing an
acquisition script for it (same standard applied to Fruits-360: verify
structure directly, don't assume from a description). This is the natural
next acquisition target.

**Open Images V7** was evaluated and deliberately excluded from acquisition
despite covering more of our classes: Google's own dataset page carries an
explicit "you must verify each image's individual license yourself"
disclaimer (images are aggregated from many original Flickr uploaders with
per-image licenses, not one blanket license for the dataset). That fails
this project's "if licensing is unclear, do not use the dataset" bar for an
*unattended acquisition script* — it could still be usable for a smaller,
manually-reviewed pull in the future, but that is a manual curation task,
not a script.

## First-party collection plan

**Required for potato and essential for egg, milk, bread, chicken, cheese**
(no viable bulk-dataset source identified for any of these six). Also needed
to add *groups* (not just images) to apple/banana/carrot/tomato/onion/
broccoli/spinach, since bulk sources so far are single-domain and
low-group-count.

Per class, target for a first pass:
- **≥8 distinct physical specimens** (8 different eggs/cartons/loaves/
  chicken packages/cheese blocks — not 8 photos of the same one), each
  treated as its own `group` in the manifest (nothing here is a "session" of
  the same item; a new specimen index, e.g. `egg_specimen03`, per physical
  item).
- **3–5 photos per specimen**, varying angle/distance only — these photos of
  the *same specimen* correctly stay one group.
- **Explicitly do NOT** take dozens of burst photos of one item and count
  them as independent examples — that inflates one group's size without
  adding a new group, which is exactly the failure mode the Fruits-360
  carrot case above demonstrates.

Conditions to vary **across specimens** (this is what the bulk sources
above are weakest on, so first-party data should deliberately compensate):
- **Locations:** fridge shelf, freezer (if relevant), pantry shelf,
  countertop, grocery bag/cart.
- **Lighting:** overhead kitchen light, phone flash, natural daylight, dim/
  evening light.
- **Backgrounds:** cluttered (realistic, other items partially in frame —
  but still one PRIMARY ingredient per the v0 labeling rule) vs. isolated
  single-item shots.
- **Devices:** at least 2 different phone/camera sensors, to avoid
  overfitting to one sensor's color/sharpness signature.
- **Packaging state:** both packaged (carton, wrapped, bagged) and
  unpackaged/loose where realistic (a peeled banana skin vs. whole, a sliced
  vs. whole loaf, etc.).

**Train/test separation for first-party data:** specimens (groups), not
just images, must be split before any photo is taken with a specific split
in mind — i.e., decide "this physical carton is a train-split specimen" (or
just let `assign_splits`' deterministic group hashing decide, as it already
does for every other source) rather than photographing everything first and
manually assigning splits afterward. In practice this means: just add every
photo of a given specimen to the manifest under one `group`, and let the
existing deterministic split do the assignment — no manual intervention
needed, this note exists only so nobody manually "balances" specimens across
splits by hand and reintroduces subtle bias.

No first-party photography has been done as part of this task (would
require a physical camera and physical ingredients — outside what this
workspace/task can perform unattended). This section is the plan to hand
off, not a completed collection.

## Domain-diversity audit

See `data/DATASET_AUDIT_v0.md`'s "Domain-diversity audit" section for the
current (single-domain, studio-only) finding on the 3 acquired classes.
Every bulk/public source evaluated so far (Fruits-360, BanglaVegNet, Open
Images, USDA/public-domain produce photography, Food-101 — see table below)
shares some version of this problem to varying degrees; first-party data is
what's meant to close the domain gap, per the plan above.

## Dataset candidates researched

| Dataset | Source | License (verified) | Relevant classes | Approx. images | Redistribution allowed? | Derivative/model training allowed? | Known domain mismatch | Date checked |
|---|---|---|---|---|---|---|---|---|
| Fruits-360 (`fruits-360-100x100`) | https://github.com/fruits-360/fruits-360-100x100 | CC BY-SA 4.0 (repo LICENSE) | apple, banana, carrot (verified directly — not tomato/onion/potato, despite an earlier incorrect secondhand summary) | ~90k total across 100+ classes; ~300-500/variety for our 3 classes | Yes, with attribution + ShareAlike | Yes, with the ShareAlike caveat noted above (unresolved legally for a shipped model) | Single fruit, plain background, turntable rotation — nothing like a cluttered fridge/pantry photo | 2026-09-12 (acquired) |
| BanglaVegNet | Mendeley Data | CC BY 4.0 (attribution only) | tomato, onion, broccoli (candidate — structure not yet verified) | Not yet confirmed | Yes, with attribution | Yes | Unknown until verified | 2026-09-12 (researched, not acquired) |
| Open Images Dataset (V7) | https://storage.googleapis.com/openimages/web/index.html | Per-image (Flickr-sourced); Google explicitly disclaims a blanket license and requires per-image verification | Most of our 13 classes have a matching category | Hundreds–low thousands per class after filtering | Only if each individual image's license is separately verified | Only if each individual image's license is separately verified | Mixed — studio and natural scenes | 2026-09-12 (researched, excluded from scripted acquisition — see rationale above) |
| Food-101 | https://data.vision.ee.ethz.ch/cvl/food-101.html | Academic/research use; commercial use unclear | None directly (prepared dishes, not raw ingredients) | 101,000 | Check terms | Check terms | Wrong problem — dishes, not raw/packaged ingredients | Previously researched |
| USDA / public-domain produce photography | Varies (USDA ARS image gallery, etc.) | Often public domain (US govt work) — verify per image | Most produce classes | Small; needs manual curation | Yes if genuinely public domain | Yes | Idealized/studio produce photography | Previously researched |
| Milk/egg/bread/cheese/chicken | No bulk source identified | N/A | milk, egg, bread, chicken, cheese | N/A | N/A | N/A | These 5 (+potato) need first-party photography — see plan above | 2026-09-12 |

## User data policy (explicit)

**User-uploaded Scan photos may NOT be used for training without explicit,
informed, opt-in consent and a published data-use policy.** No such consent
flow or policy exists yet. Nothing in this workspace reads from or writes to
the mobile app's Supabase project, and nothing here should be wired up to do
so until that policy exists - this is a product and legal decision, not a
technical default this workspace sets on its own.

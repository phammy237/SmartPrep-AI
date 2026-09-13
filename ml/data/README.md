# Data

No dataset is checked into this repository. `raw/`, `raw_acquired/`,
`processed/`, and `splits/` are gitignored (see `ml/.gitignore`) and
currently contain nothing but a `.gitkeep` placeholder each (plus, locally,
whatever `scripts/acquire/*.py` has actually downloaded into
`raw_acquired/` — those files exist on disk but are never committed).

**Current real-dataset status (2026-09-13): NOT READY FOR TRAINING.** Only
3 of 13 classes (apple, banana, carrot) have any real, licensed images, and
even those three fail the per-class split-coverage gate. A second source
(BanglaVegNet, targeting tomato/onion/potato/broccoli/spinach) was
researched and its acquisition script built and tested, but real acquisition
is currently **blocked on one documented manual step** (see "BanglaVegNet"
below and `data/DATASET_AUDIT_v0.md`) — not bypassed, not guessed around.
See `data/DATASET_AUDIT_v0.md` for the full, mechanically-generated audit
(real numbers, not projected) and exactly what's missing.

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
path,label,source_label,group,source_dataset,source_url,license,original_id,first_party
data/raw_acquired/fruits360/apple/fruits360_Apple_Braeburn_1_0_100.jpg,apple,Apple,fruits360:apple:Apple Braeburn 1,fruits360,https://github.com/fruits-360/fruits-360-100x100/blob/main/Training/Apple%20Braeburn%201/0_100.jpg,CC BY-SA 4.0,0_100.jpg,False
```

`source_label` is the class name AS THE SOURCE DATASET ITSELF calls it —
kept distinct from `label` (SmartPrep's taxonomy) whenever an acquisition
script maps a source category onto a different SmartPrep class. This
matters when the two genuinely differ (e.g. BanglaVegNet's "Green Spinach"
→ SmartPrep's "spinach", below) — the rename is never silent; both names are
always in the row. Never assume `source_label == label` just because a
particular source (like Fruits-360 here) happens not to need a rename.

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

### Fruits-360

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

### BanglaVegNet — built and tested, acquisition currently blocked

- **Script:** `scripts/acquire/banglavegnet.py`
- **Official source (verified 2026-09-13):** Mendeley Data, DOI
  `10.17632/rtx9ngb68j.2` — "A Comprehensive Image Dataset of Vegetables
  Grown in Bangladesh" (this record's v1 was titled "BanglaVegNet: A
  Multiclass Image Dataset of Traditional Vegetables in Bangladesh" — same
  DOI base, renamed at v2; both names refer to the one dataset). Authors:
  Rabeya Bashri Sumona, John Pritom Biswas, Md Ashiqur Rahman, Mamun Hasan,
  Sudipto Chaki (Bangladesh University of Business and Technology). Fetched
  via Mendeley's own file-listing API
  (`data.mendeley.com/api/datasets/rtx9ngb68j/files`) and per-file
  `download_url`s — not a Kaggle mirror.
- **License:** CC BY 4.0 — attribution only, no ShareAlike, simpler than
  Fruits-360's obligation.
- **Target classes (of 42 total in the dataset):** tomato, onion, potato,
  broccoli, and Green Spinach → SmartPrep's `spinach` — this rename is
  recorded explicitly via `source_label="Green Spinach"` /
  `label="spinach"` on every acquired row, never silently equated.
- **Structure — verified, matches the published description:** each class
  is split into two folders of *matching image count* — one raw (several
  MB/file) and one small (~10-15KB/file, almost certainly a resized copy of
  the same originals given the identical per-class counts). The script only
  ever requests the raw folder, with a built-in safety check (aborts a class
  if its configured folder averages under 200KB/file — that would mean the
  *processed* folder's id was pasted by mistake).
- **Why nothing has been downloaded yet:** the dataset's public file-listing
  API hard-caps its unscoped (whole-dataset) listing at 100 results, which —
  alphabetically — only reaches the 4th of 42 classes. Every plausible
  pagination override was tried (see `DATASET_AUDIT_v0.md`'s "BanglaVegNet
  acquisition status" for the full list of ~20 attempts) and none worked.
  Listing a **known** `folder_id` directly works perfectly; the only missing
  piece is discovering the folder_id for each target class's raw folder, and
  no lookup endpoint for that was found short of running the dataset page's
  client-side Angular app (no headless browser available in this
  environment).
- **The one manual step** (documented, not bypassed): open
  `https://data.mendeley.com/datasets/rtx9ngb68j/2/files`, use DevTools →
  Network to find each target class's raw-folder `folder_id`, paste the 5
  UUIDs into `scripts/acquire/banglavegnet_folders.json` (its own `_readme`
  field has the exact steps). Everything else — listing, downloading,
  validating, near-duplicate-based grouping (see below), provenance,
  idempotent re-runs — is already built and tested
  (`tests/test_acquire_banglavegnet.py`, 7 tests, no network) and needs no
  further code changes once those 5 ids are filled in.
- **Grouping:** unlike Fruits-360 (whole variety folder = one group, from
  real metadata), BanglaVegNet gives no specimen/session metadata at all —
  just sequentially-numbered files. The script instead runs
  `src.curation.duplicates.cluster_near_duplicates` (transitive union-find
  over near-duplicate pairs) over each class's downloaded images and uses
  the resulting cluster as `group`, conservatively keeping any chain of
  visually-similar photos together rather than assuming every file is an
  independent specimen.

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
path,label,source_label,split,group,source_dataset,source_url,license,original_id,first_party
data/raw/apple/apple_session1_01.jpg,apple,,train,apple_session1,first_party,,,apple_session1_01.jpg,True
data/raw_acquired/fruits360/apple/fruits360_Apple_Braeburn_1_0_100.jpg,apple,Apple,val,fruits360:apple:Apple Braeburn 1,fruits360,https://github.com/...,CC BY-SA 4.0,0_100.jpg,False
data/raw_acquired/banglavegnet/spinach/banglavegnet_Green_Spinach_0001.jpg,spinach,Green Spinach,train,<cluster-id>,banglavegnet,https://data.mendeley.com/datasets/rtx9ngb68j/2?folder_id=...,CC BY 4.0,Green_Spinach_0001.jpg,False
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
| tomato | BanglaVegNet (Mendeley, CC BY 4.0) — **script ready, blocked on 1 manual step** (see BanglaVegNet section above) | "Vegetable Image Dataset ... Bangladeshi Perspective" (Mendeley, CC BY 4.0, 329 tomato images, natural background) — research only, see below | Likely, to supplement once BanglaVegNet is unblocked |
| onion | BanglaVegNet — same status | same backup dataset (357 onion images) | Likely |
| potato | BanglaVegNet — same status (not previously identified as covered; confirmed present in this dataset's 42 classes) | same backup dataset (365 potato images) | Likely |
| broccoli | BanglaVegNet — same status | none identified in the backup dataset's 12 classes | Likely |
| spinach | BanglaVegNet ("Green Spinach" → `spinach`) — same status | none identified in the backup dataset's 12 classes | Likely |
| egg | None identified | first-party (packaged carton + individual eggs) | Yes, primary source |
| milk | None identified | first-party (multiple cartons/brands, packaged) | Yes, primary source |
| bread | None identified | first-party (loaf, sliced, bagged) | Yes, primary source |
| chicken | None identified (raw meat packaging is poorly covered by general-purpose datasets, and food-safety/quality concerns make sourcing real photos harder) | first-party (packaged, raw, both if feasible) | Yes, primary source |
| cheese | None identified | first-party (block, sliced, packaged) | Yes, primary source |

**BanglaVegNet's acquisition script is built, tested, and ready to run** —
it is blocked on exactly one documented manual step (a human copying 5
folder_id UUIDs out of a browser session; see the BanglaVegNet section
above and `DATASET_AUDIT_v0.md`), not on unresolved taxonomy or structure
questions — both were verified directly against the live API. Note also:
`potato` was previously listed as having no candidate source at all; it IS
one of BanglaVegNet's 42 classes and has been added to the target list.

**A second, independent Mendeley dataset — "Vegetable Image Dataset for
Classification Models: A Bangladeshi Perspective" (DOI
`10.17632/b9rvg4f2st.4`, CC BY 4.0, verified 2026-09-13)** — was researched
as a possible backup/domain-diversity supplement per this task's
instruction, but **deliberately not acquired**: 4,319 mobile-phone photos
with natural (unmodified) backgrounds across 12 classes, including potato
(365), onion (357), and tomato (329). Its simpler flat per-class folder
structure (no raw/processed split, per a related paper's description) would
likely be *easier* to script than BanglaVegNet if pursued later — and its
"natural background" domain is more SmartPrep-realistic than either
Fruits-360's studio shots or BanglaVegNet's likely-similar market/isolated
photography. Held back for now per the task's explicit "research only,
don't auto-combine without a clear quality reason" instruction.

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

**Required (no bulk-dataset source identified at all) for:** egg, milk,
bread, chicken, cheese. **Also planned, deliberately, for the 8 classes that
DO have a bulk source** (apple, banana, carrot, tomato, onion, potato,
broccoli, spinach) — per this task's instruction, the eventual v0 dataset
should not be dominated by public-dataset imagery even for classes where a
bulk source exists, both to add SmartPrep-realistic domain coverage (see
"Domain-diversity audit" below) and to add *groups* (independent physical
specimens), since every bulk source evaluated so far is thin on distinct
specimens per class even when it has plenty of images (the Fruits-360
carrot case above: 15 images, but only 1 specimen).

**General naming convention for every class:** `group` =
`firstparty:<class>:specimenNN` (e.g. `firstparty:egg:specimen03`) — one
group per physical item, never per photo. `assign_splits` handles the
train/val/test assignment automatically from there; nothing about groups
needs to be pre-planned by split.

### egg, milk, bread, chicken, cheese (no bulk source — first-party is the ONLY source)

| | Minimum target |
|---|---|
| Distinct physical specimens | ≥8 (8 different eggs/cartons/loaves/packages/blocks — not 8 photos of one) |
| Sessions | ≥2 separate photography sessions (different day/lighting/location each time), specimens spread across sessions, not all photographed at once |
| Photos per specimen | 3–5, varying angle/distance/framing only |
| Backgrounds | both cluttered (other items partially in frame, still one PRIMARY ingredient per the v0 labeling rule) and isolated single-item shots |
| Context | fridge shelf, pantry shelf, countertop, and grocery bag — at least 3 of these 4 represented per class |
| Packaged vs. unpackaged | both where realistic: milk (carton, always packaged — vary carton size/brand instead), egg (carton AND a few loose eggs), bread (bagged loaf AND a few sliced/unwrapped pieces), cheese (packaged block AND sliced/unwrapped), chicken (packaged raw only — food-safety reasons make "unpackaged loose chicken" impractical and unnecessary; vary packaging/cut instead) |
| Lighting | overhead kitchen light, phone flash, natural daylight, dim/evening — at least 3 of these 4 |
| Devices | ≥2 different phone/camera sensors, to avoid overfitting to one sensor's color/sharpness signature |

### apple, banana, carrot, tomato, onion, potato, broccoli, spinach (bulk source exists — first-party supplements it)

| | Minimum target |
|---|---|
| Distinct physical specimens | ≥5 per class (fewer than the no-bulk-source classes since the bulk source contributes some groups too — but ≥5 is what actually fixes the Fruits-360-style "1-3 groups total" problem found in this audit) |
| Sessions | ≥1 dedicated session per class, ideally spread across ≥2 |
| Photos per specimen | 3–5, varying angle/distance |
| Backgrounds / context / packaging / lighting / devices | same targets as the no-bulk-source table above — the whole point is SmartPrep-realistic domain coverage these classes currently have zero of, bulk source or not |

**Explicitly do NOT** take dozens of burst photos of one item and count them
as independent examples — that inflates one group's size without adding a
new group, which is exactly the failure mode the Fruits-360 carrot case in
`DATASET_AUDIT_v0.md` demonstrates (15 images, 1 group, unusable for any
split at all).

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
**Zero of SmartPrep's 13 classes currently have any SmartPrep-realistic
(fridge/pantry/countertop/grocery-bag/cluttered) imagery** — every bulk/
public source evaluated so far (Fruits-360, BanglaVegNet, the backup
Bangladeshi dataset, Open Images, USDA/public-domain produce photography,
Food-101 — see table below) shares some version of this domain gap, ranging
from Fruits-360's plain-white-turntable extreme to the backup dataset's
comparatively closer "mobile phone, natural background" style. First-party
data (see the plan above, now covering all 13 classes, not only the 5
without any bulk source) is the only way to close this gap — no combination
of the public sources researched substitutes for it.

## Dataset candidates researched

| Dataset | Source | License (verified) | Relevant classes | Approx. images | Redistribution allowed? | Derivative/model training allowed? | Known domain mismatch | Date checked |
|---|---|---|---|---|---|---|---|---|
| Fruits-360 (`fruits-360-100x100`) | https://github.com/fruits-360/fruits-360-100x100 | CC BY-SA 4.0 (repo LICENSE) | apple, banana, carrot (verified directly — not tomato/onion/potato, despite an earlier incorrect secondhand summary) | ~90k total across 100+ classes; ~300-500/variety for our 3 classes | Yes, with attribution + ShareAlike | Yes, with the ShareAlike caveat noted above (unresolved legally for a shipped model) | Single fruit, plain background, turntable rotation — nothing like a cluttered fridge/pantry photo | 2026-09-12 (acquired) |
| BanglaVegNet / "A Comprehensive Image Dataset of Vegetables Grown in Bangladesh" | Mendeley Data, DOI `10.17632/rtx9ngb68j.2` | CC BY 4.0 (attribution only) | tomato, onion, potato, broccoli, Green Spinach→spinach — all 5 verified present among its 42 classes | 4,730 total (1,877 raw); per-class counts for our 5 not yet confirmed (acquisition blocked) | Yes, with attribution | Yes | Market/isolated vegetable photography per description — not fridge/pantry conditions; not yet directly observed for our 5 classes | 2026-09-13 (researched + script built; acquisition blocked on 1 manual step) |
| "Vegetable Image Dataset for Classification Models: A Bangladeshi Perspective" | Mendeley Data, DOI `10.17632/b9rvg4f2st.4` | CC BY 4.0 (attribution only) | potato (365), onion (357), tomato (329) | 4,319 total across 12 classes | Yes, with attribution | Yes | Mobile-phone photos, natural (unmodified) background — the closest of any researched source to SmartPrep's real domain, but still not fridge/pantry/countertop specifically | 2026-09-13 (researched only, not acquired — backup/diversity candidate per task instruction) |
| Open Images Dataset (V7) | https://storage.googleapis.com/openimages/web/index.html | Per-image (Flickr-sourced); Google explicitly disclaims a blanket license and requires per-image verification | Most of our 13 classes have a matching category | Hundreds–low thousands per class after filtering | Only if each individual image's license is separately verified | Only if each individual image's license is separately verified | Mixed — studio and natural scenes | 2026-09-12 (researched, excluded from scripted acquisition — see rationale above) |
| Food-101 | https://data.vision.ee.ethz.ch/cvl/food-101.html | Academic/research use; commercial use unclear | None directly (prepared dishes, not raw ingredients) | 101,000 | Check terms | Check terms | Wrong problem — dishes, not raw/packaged ingredients | Previously researched |
| USDA / public-domain produce photography | Varies (USDA ARS image gallery, etc.) | Often public domain (US govt work) — verify per image | Most produce classes | Small; needs manual curation | Yes if genuinely public domain | Yes | Idealized/studio produce photography | Previously researched |
| Milk/egg/bread/cheese/chicken | No bulk source identified | N/A | milk, egg, bread, chicken, cheese | N/A | N/A | N/A | These 5 need first-party photography — see plan below | 2026-09-13 |

## User data policy (explicit)

**User-uploaded Scan photos may NOT be used for training without explicit,
informed, opt-in consent and a published data-use policy.** No such consent
flow or policy exists yet. Nothing in this workspace reads from or writes to
the mobile app's Supabase project, and nothing here should be wired up to do
so until that policy exists - this is a product and legal decision, not a
technical default this workspace sets on its own.

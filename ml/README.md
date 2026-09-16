# SmartPrep Ingredient Model — v0 (classification baseline)

This is SmartPrep's custom ML workspace, isolated from the Expo/mobile app
(`../mobile/`). Nothing in `../mobile/package.json` depends on anything here,
and nothing here imports React Native or touches the Supabase project. See
`../mobile/docs/INGREDIENT_MODEL_ROADMAP.md` for the full staged plan this is
Phase v0 of, and the product context for why SmartPrep is building a custom
model instead of relying on a third-party multimodal API long-term.

## What v0 is — and is not

v0 proves the complete pipeline works, end to end:

```text
dataset -> preprocessing -> training -> validation -> test evaluation
        -> saved checkpoint -> reproducible inference
```

for a small, fixed set of common ingredients.

**v0 is a whole-image classifier: one image in, one predicted class out.**
It assumes exactly one primary ingredient per image. It is intentionally
**not**:

- multi-object detection (no bounding boxes, no "what are the 5 things in
  this fridge photo" - that's v1, see below),
- integrated with the Expo app or the `IngredientInferenceProvider`
  abstraction (`../mobile/lib/scan/providers/`) - this is a separate,
  standalone research/training workspace. The mobile app's own custom-model
  provider (`smartPrepModelProvider`) is currently an unimplemented stub
  precisely because this workspace hasn't produced a trained model yet,
- trained on real data yet (see `PIPELINE_VERIFIED_NOT_TRAINED.md` - as of
  this commit, **no accuracy number from this workspace is meaningful**; only
  the pipeline mechanics have been verified, on tiny synthetic images).

SmartPrep's real Scan use case needs multi-object detection with bounding
boxes (fridge/pantry shelves have several ingredients per photo) - that is
v1's job, once v0 has proven the pipeline is sound.

## The dataset pipeline

Everything from a raw public dataset (or a phone photo) to a trained-model-ready
manifest goes through one fixed sequence:

```text
Raw Sources
     ↓
Acquisition + Provenance
     ↓
Image Validation + Duplicate Clustering
     ↓
Group-Aware Splitting
     ↓
Dataset Statistics + Leakage Audit
     ↓
Train / Validation / Test Manifests
     ↓
Training-Time Transforms
```

A few things about this pipeline are architectural invariants, not
incidental implementation details:

- **Provenance is recorded at acquisition time, not reconstructed later.**
  Every acquired image carries `source_dataset`, `source_url`, `license`,
  `source_label` (the class name as the *source* dataset calls it, kept
  distinct from SmartPrep's own `label`), and `first_party` from the moment
  it's downloaded (`src/datasets/manifest.py::CandidateImage`).
- **Grouping happens before splitting, and splitting never sees individual
  images - only groups.** A "group" is whatever set of images can't be
  treated as independent examples (turntable frames of one physical fruit,
  near-duplicate photos from one shoot, multiple angles of one first-party
  specimen). `assign_splits` assigns an entire group to exactly one of
  train/val/test; it is structurally impossible for two images in the same
  group to end up in different splits.
- **Splitting is stratified per class, and keyed by `(label, group)`.**
  Each class's own groups are shuffled and split independently at the
  configured ratio - one class's split outcome never depends on how many
  groups any other class happens to contribute to the same manifest.
  Keying the assignment by `(label, group)` rather than by the bare group
  string means two different classes can never interfere with each other's
  split even if a group-naming scheme happened to produce the same literal
  string for both (see `src/datasets/manifest.py::assign_splits`).
- **Leakage auditing is a separate, independent check over an
  already-built manifest - it does not create groups and does not prevent
  leakage itself.** `src/curation/leakage.py` re-derives group/split
  membership from a finished manifest and additionally catches what
  grouping alone cannot: two *different* groups that happen to contain
  byte-identical or visually near-identical images. A manifest is only
  trusted once this audit comes back clean.
- **No image is ever normalized, resized, or augmented as part of dataset
  preparation.** Every stage above operates on the original acquired
  bytes. ImageNet mean/std normalization and train-time augmentation
  (`src/datasets/transforms.py`) are applied **dynamically, in memory, at
  `__getitem__` time**, only to samples already assigned to the *train*
  split - never persisted to disk, never a candidate for splitting, and
  never applied to val/test (`build_eval_transform` is deterministic:
  resize + normalize only, always). This is what prevents the classic leak
  where two augmented variants of one source photo land on opposite sides
  of a split.

### Acquisition + provenance

`scripts/acquire/` holds one script per public source, each idempotent
(never re-downloads or overwrites a file already on disk), credential-free,
and scoped to an official distribution channel (never a scrape, never a
reupload when the original is reachable):

| Script | Source | Classes | License |
|---|---|---|---|
| `fruits360.py` | Fruits-360 (GitHub) | apple, banana, carrot | CC BY-SA 4.0 |
| `bangladeshi_vegetables.py` | Mendeley DOI `10.17632/b9rvg4f2st.4` | potato, onion, tomato | CC BY 4.0 |
| `vegetable_leaf_spinach.py` | Mendeley DOI `10.17632/9c7crxrvmf.1` | spinach (supplemental - leaf close-ups, not whole produce) | CC BY 4.0 |
| `banglavegnet.py` | Mendeley DOI `10.17632/rtx9ngb68j.2` | tomato, onion, potato, broccoli, spinach (targeted) | CC BY 4.0 |

`banglavegnet.py` is fully implemented and tested but currently **dormant**:
the source's public file-listing API caps its directory listing at 100
results with no discovered way to page past it for the classes this
project needs, so acquisition is blocked on a one-time manual step
(recorded in `scripts/acquire/banglavegnet_folders.json`). It isn't on the
critical path since the other three scripts already cover more classes
more easily - see `data/DATASET_AUDIT_v0.md` for the full investigation.

`bangladeshi_vegetables.py` is the least trivial of the four: its source is
one official ~2GB ZIP archive, and only 3 of its 12 classes are wanted. It
reads the archive's central directory over a handful of small HTTP Range
requests, fetches each wanted class's contiguous byte span in one Range GET
(rather than the whole archive), and extracts/CRC-verifies files from that
span in memory - see the script's own docstring for the exact mechanism.

`scripts/acquire/_shared.py` holds what's genuinely identical across every
acquisition script (a shared `User-Agent`, a `download_file` helper, and
the path-relativization logic that keeps a committed provenance CSV free of
any local machine's absolute paths) - each script's own fetch mechanism
stays script-specific, since a per-file HTTP download, a byte-range fetch,
and a whole-archive-then-extract each genuinely differ.

**First-party collection** is the other acquisition path, for classes with
no usable public source and for adding SmartPrep-realistic (fridge/pantry/
countertop) imagery to classes that do have one:

- `data/FIRST_PARTY_COLLECTION_GUIDE.md` - a concrete, per-class shooting
  guide (specimen counts, sessions, backgrounds, packaging states, and the
  `fp_<class>_<specimen>_<session>` group-naming convention).
- `scripts/import_first_party.py` - moves photos from
  `data/first_party_inbox/<class>/` into the canonical `data/raw/<class>/`
  layout: validates each image, skips anything already imported (by
  destination filename *and* by content hash, so the same photo saved
  twice under different names isn't imported twice), rejects and reports
  invalid files without touching them, and never guesses a class from an
  unrecognized inbox folder name.

### Image validation + duplicate clustering

`src/curation/validation.py::validate_image` rejects a corrupt file, an
unsupported format, or an image outside `MIN_DIMENSION`/`MAX_DIMENSION`
before it can enter a manifest - every acquisition script and the
first-party importer run every file through this.

`src/curation/duplicates.py` has two related but distinct tools:

- `find_exact_duplicates` - SHA-256 byte-identity, for catching a source
  archive that (as one real one did) contains the same file twice under
  different names.
- `cluster_near_duplicates` - a simple average-hash (aHash) perceptual
  hash plus union-find, used by every acquisition script that has no real
  specimen/session metadata (i.e. everything except Fruits-360, which
  already knows its own turntable-variety structure). Any chain of
  visually near-identical images - not just direct pairs - ends up in one
  group; an image with no near-duplicate partner becomes its own singleton
  group. This is deliberately conservative: it is judged worse to
  under-count how related two images are than to over-merge two
  genuinely-different but visually-similar specimens into one group.

This clustering is what produces the `group` value that splitting later
treats as one atomic unit - grouping is a curation-time concern, entirely
separate from, and prior to, splitting.

### Group-aware splitting

`src/datasets/manifest.py::assign_splits` is the one place a split is
assigned, covered above under "architectural invariants." `split_groups`
underneath it is a pure function - given a list of group names, a ratio,
and a seed, it deterministically shuffles and partitions them; the same
inputs always produce the same output, and it has no notion of class at
all (that's `assign_splits`'s job, one layer up).

### Dataset statistics + leakage audit

`src/curation/statistics.py::build_dataset_statistics` computes, from one
candidate pool and (optionally) a built manifest: images and groups per
class, source distribution per class, an imbalance ratio, image-dimension
summaries, and rejected/duplicate counts. `src/curation/leakage.py` runs
the three independent checks described above. `scripts/audit_dataset.py`
is the one command that runs both over whatever's currently acquired and
prints a single pass/fail report - see below.

### Manifests

`src/datasets/manifest.py` builds `splits/manifest.csv` two ways:
`build_manifest_rows` (first-party-only - every class needs a `data/raw/`
subdirectory) and `build_combined_manifest_rows` (the real v0 path - merges
first-party photos with one or more acquired-source provenance CSVs into
one pool before splitting, and raises, naming every class involved, if any
class has zero candidates from any source). Once a manifest exists at
`manifest_path`, it's read back rather than silently regenerated unless
`force_resplit: true` - a dataset snapshot's split assignment doesn't
change out from under an experiment just because training ran again.

### Training-time transforms

Only after a manifest exists does `src/datasets/transforms.py` come into
play, at data-loading time, inside the training loop - not before, and not
as part of anything above. See "no image is ever normalized... as part of
dataset preparation" above; this section exists solely so the ordering in
the pipeline diagram is unambiguous.

## Current dataset status

**NOT READY FOR TRAINING. READY FOR FIRST-PARTY COLLECTION.** 7 of 13
classes have real, licensed images (apple, banana, carrot, potato, onion,
tomato, spinach); apple/banana/carrot don't yet have enough distinct groups
for a safe 3-way split, and spinach's only source is leaf-domain rather
than grocery-domain. 6 classes have zero images (broccoli, egg, milk,
bread, chicken, cheese). Reproduce this finding at any time:

```powershell
python scripts/audit_dataset.py
```

which auto-discovers every `data/provenance/*.csv`, scans `data/raw/` for
first-party photos, and prints per-class image/group/split counts, source
distribution, the leakage audit, and a final gate verdict. See
`data/DATASET_AUDIT_v0.md` for the full audit narrative and
`data/README.md` for the per-class sourcing plan.

## Starter taxonomy

13 classes, chosen for household commonality, visual distinguishability, and
SmartPrep relevance (see `../mobile/docs/INGREDIENT_MODEL_ROADMAP.md` §3 for
the reasoning behind this specific set):

```text
apple, banana, tomato, onion, potato, carrot, broccoli, spinach,
egg, milk, bread, chicken, cheese
```

**Canonical source of truth:** `configs/classes.json`. Every script
(`src/datasets/manifest.py`, `src/training/train.py`,
`src/evaluation/evaluate.py`, `src/inference/predict.py`) loads the class
list from there via `src/utils/classes.py::load_class_map()` - none of them
hardcode the list or its order. A trained checkpoint also embeds its own copy
of the class map (`class_map_from_dict`) so a saved model stays
self-describing even if `classes.json` later changes.

**Documented ambiguity assumptions** (see `src/utils/classes.py`'s
docstring for the full list): e.g. "chicken" means raw/packaged meat, not a
cooked dish; "milk" means the retail container, not a splash; "cheese" means
a block/wedge/slice, not a prepared dish. An image showing several ingredients
has no single correct v0 label and should not be included in the dataset.

## Environment setup

```powershell
cd ml
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

CPU-only PyTorch/torchvision wheels: if `pip install -r requirements.txt`
pulls a CUDA build you don't want, install the CPU wheels first:

```powershell
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

All commands below assume your working directory is `ml/`.

## Commands

### Acquire public datasets

```powershell
python scripts/acquire/fruits360.py
python scripts/acquire/bangladeshi_vegetables.py
python scripts/acquire/vegetable_leaf_spinach.py
```

Each is safe to re-run - already-downloaded files are skipped, not
re-fetched or overwritten.

### Import first-party photos

```powershell
python scripts/import_first_party.py
```

Reads `data/first_party_inbox/<class>/`, writes validated/deduplicated
copies into `data/raw/<class>/`. See `data/FIRST_PARTY_COLLECTION_GUIDE.md`
before shooting.

### Audit the current dataset

```powershell
python scripts/audit_dataset.py
```

### Build (or inspect) the manifest without training

```powershell
python scripts/make_manifest.py --config configs/v0_baseline.yaml
python scripts/make_manifest.py --config configs/v0_baseline.yaml --force   # rebuild/resplit
```

### Train

```powershell
python -m src.training.train --config configs/v0_baseline.yaml
```

Writes `outputs/<run_name>-<timestamp>/` containing `best_model.pt`,
`config.json`, `class_map.json`, `history.json`, `metrics.json`.

### Evaluate on the held-out test split

```powershell
python -m src.evaluation.evaluate --checkpoint outputs/<run>/best_model.pt --manifest data/splits/manifest.csv
```

The test split is used **only** here, for final reporting - it is never used
to pick hyperparameters or the "best" epoch (that's the validation split,
inside `train.py`). Writes `test_metrics.json` and `confusion_matrix.png`
next to the checkpoint by default.

### Predict on one image

```powershell
python -m src.inference.predict --image path\to\photo.jpg --checkpoint outputs\<run>\best_model.pt
```

Output contract (kept conceptually compatible with the future SmartPrep
inference provider - see `src/inference/postprocess.py` - but **not**
integrated with the Expo app):

```json
{
  "predicted_class": "tomato",
  "confidence": 0.91,
  "top_k": [
    {"class": "tomato", "confidence": 0.91},
    {"class": "apple", "confidence": 0.05},
    {"class": "onion", "confidence": 0.02}
  ],
  "model_version": "ingredient-classifier-v0-baseline"
}
```

## Configuration

Every training knob lives in one YAML file (`configs/v0_baseline.yaml`),
parsed and validated by `src/training/config.py` - nothing is a scattered
literal in the training code. Fields: `seed`, `classes_path`, `data_dir`,
`manifest_path`, `force_resplit`, `image_size`, `batch_size`, `epochs`,
`learning_rate`, `optimizer`, `weight_decay`, `pretrained`, `backbone`,
`num_workers`, `device`, `output_dir`, and nested `split` / `augmentation` /
`early_stopping` sections. An invalid config (bad split ratios, unknown
backbone/optimizer, non-positive batch size, etc.) raises immediately rather
than failing partway through a run.

## Backbone choice: ResNet18 (v0 default)

Compared briefly before choosing:

| Backbone | Params | Why / why not for v0 |
|---|---|---|
| **ResNet18 (chosen)** | ~11M | The most standard, most-documented transfer-learning baseline - easiest to reason about and debug, so a pipeline bug is never confused with an architecture quirk. That's exactly what v0 needs to prioritize (reproducibility, simple training, understandable baseline metrics) over squeezing out extra accuracy or mobile-friendliness. |
| EfficientNet-B0 | ~5.3M | Generally a better accuracy/efficiency tradeoff than ResNet18, but training dynamics are a bit more finicky to get right as a *first* baseline. Worth comparing once v0's pipeline is proven. |
| MobileNetV3-Small | ~2.5M | The most mobile/export-friendly of the three (relevant to v3's eventual on-device questions), but a less common transfer-learning reference point and historically a lower accuracy ceiling as a baseline. Better fit for later production/export decisions than for proving the pipeline right now. |

All three are implemented in `src/training/model.py` (`SUPPORTED_BACKBONES`)
and selectable via `backbone:` in the config - comparing them for real is a
config change, not a code change.

## CPU / GPU behavior

`device: auto` (default) picks CUDA if `torch.cuda.is_available()`, else CPU.
`device: cpu` / `device: cuda` force a choice; forcing `cuda` on a machine
without one raises immediately rather than silently running on CPU. Training
code has no CPU-specific or GPU-specific branches beyond device placement, so
the same config runs unmodified on a Colab/Kaggle GPU notebook or a local CPU
machine - see `../mobile/docs/INGREDIENT_MODEL_ROADMAP.md` §5 for the
Colab/Kaggle recommendation for actual (non-tiny) training runs.

## Reproducibility

- `src/utils/seed.py::set_seed()` seeds `random`, `numpy`, `torch`, and CUDA
  (when available), and sets deterministic cuDNN convolution algorithms.
- The dataset split is a pure function of (raw directory contents, split
  ratios, seed) - see `src/datasets/manifest.py`. Once a manifest file exists,
  it is reused rather than silently regenerated (`force_resplit: false`),
  so re-running training later doesn't quietly reshuffle the dataset.
- Every run's exact config, class map, and training history are saved
  alongside the checkpoint (`outputs/<run>/`), so a run can be inspected or
  compared without re-deriving what produced it.
- To reproduce a specific run: copy its `config.json` back to a `.yaml` (or
  point `--config` at a copy with the same values) and re-run
  `src/training/train.py` with the same `data/raw/` contents and the same
  `manifest.csv` (or `force_resplit: true` with the same seed, if the
  manifest itself isn't being reused).

## Outputs

```text
outputs/<run_name>-<timestamp>/
  best_model.pt          # model_state_dict + backbone + image_size + class_map + model_version
  config.json            # the exact TrainingConfig used
  class_map.json         # the exact class map used
  history.json           # per-epoch train/val loss + accuracy
  metrics.json           # best_epoch, best_val_accuracy, epochs_run
  test_metrics.json      # written by evaluate.py, not train.py
  confusion_matrix.png   # written by evaluate.py
```

`outputs/` is gitignored. No experiment-tracking service (MLflow/W&B) is used
for v0 - this local structured layout is enough at this scale; revisit only
if run volume clearly justifies the added dependency.

## Tests

```powershell
python -m pytest -q
```

**159 tests, 0 network calls** (acquisition scripts' HTTP/download
functions are monkeypatched against real, small, in-memory archives built
with the standard library's own `zipfile`, so the test data is a genuine
ZIP, not a hand-rolled approximation). Coverage includes: dataset splitting
and its `(label, group)` invariant (`test_manifest_split.py`,
`test_provenance_manifest.py`), every acquisition script
(`test_acquire_*.py`), image validation (`test_validation.py`), exact and
near-duplicate detection (`test_duplicates.py`), the leakage audit
(`test_leakage.py`), dataset statistics (`test_statistics.py`), the
label-review-queue builder (`test_label_audit.py`), first-party import
(`test_import_first_party.py`), the audit command (`test_audit_dataset.py`),
class-map loading (`test_classes.py`), training config validation
(`test_config.py`), model construction (`test_model.py`), evaluation
metrics (`test_metrics.py`), inference post-processing
(`test_postprocess.py`), the `Dataset`/transform contract
(`test_dataset.py`), and a full synthetic-data pipeline smoke test
(`test_pipeline_smoke.py`) that trains, evaluates, and runs inference
end-to-end on tiny generated images to prove the mechanics work - not to
produce a meaningful accuracy number.

This test count is specific to this `ml/` workspace and is not combined
with the mobile app's separate Jest suite (see the root `README.md`).

## Known limitations (v0)

- Whole-image classification only - no bounding boxes, no multi-object
  detection.
- No real dataset yet - see `PIPELINE_VERIFIED_NOT_TRAINED.md` and "Current
  dataset status" above. Every accuracy number produced so far is from
  synthetic test fixtures, not real ingredient photos.
- The near-duplicate detector (aHash, 8×8, grayscale) is coarse: it's
  blind to color, so two visually-similar-but-differently-colored subjects
  (found in practice: two different Fruits-360 apple varieties) can
  register as a false-positive near-duplicate. The leakage audit only
  compares images of the same class for exactly this reason - a
  perceptual-hash collision between two different classes can never
  indicate real specimen leakage.
- No augmentation/architecture search - hyperparameters in
  `configs/v0_baseline.yaml` are reasonable defaults, not tuned.

## Path to v1 (multi-object detection)

Once v0 has a real dataset and a real trained baseline: v1 moves from
whole-image classification to object detection (multiple ingredients per
image, bounding boxes, per-detection confidence, ~20-30 classes). See
`../mobile/docs/INGREDIENT_MODEL_ROADMAP.md` §2 (Model v1) and §4 (training
architecture recommendation - a YOLO-family detector) for the plan. v1 is a
new set of modules under this same `ml/` workspace, not a rewrite of v0's
data/config/utils layers - `src/utils/classes.py`, `src/training/config.py`'s
general shape, and the manifest/grouping approach in
`src/datasets/manifest.py` are all meant to carry forward.

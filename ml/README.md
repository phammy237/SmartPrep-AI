# SmartPrep Ingredient Model — v0 (classification baseline)

This is SmartPrep's custom ML workspace, isolated from the Expo/mobile app
(`../mobile/`). Nothing in `../mobile/package.json` depends on anything here,
and nothing here imports React Native or touches the Supabase project. See
`../mobile/docs/INGREDIENT_MODEL_ROADMAP.md` for the full staged plan this is
Phase v0 of, and the product context for why SmartPrep is building a custom
model instead of relying on a third-party multimodal API long-term.

## What v0 is — and is not

v0 proves the complete pipeline works, end to end:

```
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
  standalone research/training workspace,
- trained on real data yet (see `PIPELINE_VERIFIED_NOT_TRAINED.md` - as of
  this commit, **no accuracy number from this workspace is meaningful**; only
  the pipeline mechanics have been verified, on tiny synthetic images).

SmartPrep's real Scan use case needs multi-object detection with bounding
boxes (fridge/pantry shelves have several ingredients per photo) - that is
v1's job, once v0 has proven the pipeline is sound.

## Starter taxonomy

13 classes, chosen for household commonality, visual distinguishability, and
SmartPrep relevance (see `../mobile/docs/INGREDIENT_MODEL_ROADMAP.md` §3 for
the reasoning behind this specific set):

```
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

## Expected dataset layout

See `data/README.md` for the full explanation (directory layout, manifest
schema, dataset-candidate research, and the first-party collection strategy).
Short version:

```
data/raw/<class_name>/*.jpg|png     # one subdirectory per class in classes.json
```

`data/raw/`, `data/raw_acquired/`, `data/processed/`, and `data/splits/` are
gitignored - no dataset is or should be committed to this repository.

**Real dataset status (2026-09-13): NOT READY FOR TRAINING** - only 3 of 13
classes have any real, licensed images so far, and even those three don't
yet have enough distinct groups for a usable train/val/test split. A second
acquisition script (BanglaVegNet, targeting tomato/onion/potato/broccoli/
spinach) is built and tested but blocked on one documented manual step - see
`data/DATASET_AUDIT_v0.md` for the full audit and `data/README.md` for the
acquisition tooling (`scripts/acquire/`), curation tooling (`src/curation/`
- duplicate detection, validation, label-review queues, leakage auditing,
dataset statistics), and per-class sourcing plan.

## Commands

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

## Known limitations (v0)

- Whole-image classification only - no bounding boxes, no multi-object
  detection.
- No real dataset yet - see `PIPELINE_VERIFIED_NOT_TRAINED.md`. Every number
  produced so far is from synthetic test fixtures.
- The dataset-grouping key (`default_group_key` in `manifest.py`) is a
  simple filename-suffix heuristic, not a real capture-session id - it should
  be revisited once real captured data exists with actual session metadata.
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

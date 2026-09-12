# PIPELINE VERIFIED — MODEL NOT YET TRAINED ON REAL DATA

No real ingredient dataset exists in this repository yet (see `data/README.md`
for sourcing research; nothing has been downloaded). Every number below comes
from tiny synthetic images (solid colors + noise, generated in
`tests/conftest.py` / ad-hoc smoke runs) - they exist to prove the pipeline's
*mechanics*, not to claim anything about model quality.

**Do not cite any accuracy/precision/recall/F1 number from this workspace as
real until a run has been made against an actual curated ingredient dataset.**

## What was actually verified, end to end, on synthetic data

Via `tests/test_pipeline_smoke.py` (pytest) and a separate manual run of the
real CLI commands (`python -m src.training.train`, `python -m
src.evaluation.evaluate`, `python -m src.inference.predict`) against a
throwaway synthetic dataset outside this repo:

1. Manifest scanning + deterministic, session-grouped train/val/test
   splitting from a raw image directory.
2. Dataset loading + train/eval transforms producing correctly-shaped tensors.
3. `resnet18` (pretrained=False, to avoid any network dependency) training for
   a couple of epochs on CPU, with per-epoch train/val loss+accuracy tracked.
4. Best-checkpoint selection and a complete run directory written: config
   used, class map, training history, metrics, and `best_model.pt`.
5. Held-out test-split evaluation: accuracy, macro precision/recall/F1,
   per-class precision/recall/F1, confusion matrix, top-k accuracy, and
   highest-confidence-error extraction, all producing well-formed output.
6. A single-image prediction from the saved checkpoint alone, in the
   documented JSON contract (`predicted_class`, `confidence`, `top_k`,
   `model_version`), and confirmed deterministic (same checkpoint + image ->
   same result on a second call).
7. Re-running training against an existing manifest path with a different
   seed does NOT reshuffle the dataset (`force_resplit: false` behavior).

The manual CLI run's actual numbers (recorded here only to show they were
inspected, not because they mean anything): 2-epoch training reached
`val_accuracy≈0.67` on a 6-image validation split; test-split accuracy was
`0.0` and top-2 accuracy was `1.0` on a 3-image test split. With 3 classes,
~3-9 images per split, no pretrained weights, and 2 epochs, these numbers are
expected to be close to chance and are reported here as evidence the pipeline
ran, not as a baseline to beat.

## What was NOT done

- No real photo of a real ingredient was used anywhere in this workspace.
- No dataset was downloaded, scraped, or licensed-in.
- No claim is made about v0's eventual real-world accuracy.
- No model was exported, deployed, or integrated with the Expo app.

## Next task

Dataset acquisition/curation (starting from the candidates in
`data/README.md`, with an actual per-source license review) and the first
real training run against real images.

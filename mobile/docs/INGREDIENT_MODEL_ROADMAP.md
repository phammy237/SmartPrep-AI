# Ingredient Recognition Model Roadmap

SmartPrep is moving away from a third-party multimodal model (OpenAI Vision) as
the intended production-primary ingredient-recognition system, and toward a
custom SmartPrep-trained model, developed and evaluated in stages. This
document is the staged plan. It complements (does not replace)
`docs/LIVE_VALIDATION.md`, which tracks what has actually been verified live.

**Product direction reminder** (see the pivot discussion this doc originates
from): SmartPrep does not become "AI everywhere." ML is used only for
ingredient recognition from photos. Nutrition lookup (USDA), barcode lookup
(Open Food Facts + USDA exact-GTIN verification), pantry state, expiry/FEFO,
planning, grocery, cooking deductions, and Kitchen Impact all remain
deterministic. Receipt OCR remains AWS Textract (external) for now - it is a
document-extraction problem, not a recognition problem SmartPrep needs to own.

## 0. Where the OpenAI path stands now

`supabase/functions/scan-ingredients` (OpenAI vision) is **not deleted** and
**not deployed**. It is kept as:

- a benchmark once a SmartPrep model exists (compare accuracy/latency/cost),
- an optional fallback for low-confidence/unsupported cases (see the hybrid
  strategy in §4), and
- an internal comparison tool during model development.

It is no longer treated as the architecture SmartPrep ships ingredient
scanning on. See `lib/scan/providers/` for how the app now depends on an
`IngredientInferenceProvider` abstraction rather than this function directly
(architecture detail below in the companion audit; the short version: the app
was already largely provider-neutral above the Edge Function client, and now
formally is).

**OpenAI is opt-in, not a default.** `getActiveIngredientInferenceProvider()`
(`lib/scan/providers/index.ts`) only returns the OpenAI benchmark provider
when the non-secret `EXPO_PUBLIC_INGREDIENT_INFERENCE_PROVIDER=openai-benchmark`
flag is explicitly set (`lib/scan/providers/config.ts`). With it unset - the
production default - Scan fails closed with a distinct, honest
`ScanInferenceError('provider_unavailable')` rather than silently calling
OpenAI or silently pretending `smartPrepModelProvider` (still unimplemented)
is active. `ProcessingScreen` already renders this case with its own message
("Photo scanning isn't available right now. Add items by hand.") - manual
pantry entry and barcode intake are untouched by any of this.

## 1. Current schema audit for ML feedback (Phase E)

**Finding: the existing `scans` / `scan_sections` / `scan_detections` schema
does NOT yet give us enough data for the feedback loop we want.** No migration
was written for this in the current pass - this section documents the gap and
the smallest additive fix, deferred until it's actually being acted on.

What `scan_detections` (migration `0008`) stores today, per confirmed
detection: `display_name`, `canonical_ingredient_id`, `quantity`, `unit`,
`category`, `identity_edited` (boolean), `quantity_edited` (boolean),
`pantry_item_id`. This is the **final, user-confirmed state only**.

Gaps against the desired loop (`image/detection -> model prediction -> user
review -> accepted/corrected/rejected label -> future training dataset`):

1. **No original model prediction is stored.** Only the post-review value
   (`display_name`, `quantity`, `unit`, `category`) lands in the database. If
   the user edits a detection before confirming, the model's original
   proposal (name, confidence) is gone - never sent to the backend at all
   (`services/scanService.ts` builds the RPC payload from the current,
   possibly-edited, `ScanDetection` state).
2. **Rejected detections are never persisted.** `confirmScan` filters to
   `!d.isRemoved` before calling `beginScanConfirmation` - a detection the
   user removed (a false positive) is dropped client-side and never reaches
   the database in any form. This is the single biggest gap: false-positive
   signal is currently unrecoverable after the review screen closes.
3. **`identity_edited` is currently always `false`.** Not a bug - there is
   genuinely no UI action today that edits a detection's identified name in
   place (`DetectionCard.tsx` only supports editing quantity and freshness).
   The only way a user "corrects" an identity today is: mark the wrong
   detection removed, then add the right one manually via the "Add
   Ingredient" panel - two unrelated detection records, not a
   correction-of-X-into-Y. `scanService.ts` hardcodes `identityEdited: false`
   for exactly this reason - it would be dishonest to claim otherwise from the
   current UI.
4. **No `provider` / `model_version` column anywhere.** Even for the rows that
   do exist, there is no record of which inference backend proposed the
   original detection.

### Smallest future-compatible addition (proposed, NOT implemented this pass)

If/when this is acted on, the smallest additive, backward-compatible change is:

- Add nullable columns to `scan_detections`: `predicted_name text`,
  `predicted_confidence numeric`, `predicted_category text`,
  `inference_provider text`, `inference_model_version text`, and an
  `outcome text check (outcome in ('accepted_unchanged','corrected','rejected'))`.
  All nullable/optional so every existing row and every existing read path
  stays valid untouched.
- Change the client to send removed detections too (as `outcome = 'rejected'`
  intent rows, no `pantry_item_id`), instead of filtering them out before
  `beginScanConfirmation`. This is a **product-flow change**, not just a
  schema change - `begin_scan_confirmation`'s RPC contract and
  `confirmScan`'s payload-building both need it, which is why this was not
  implemented in this pass (the instruction was schema-only unless clearly
  backward-compatible **and** clearly justified; the client-flow half of this
  is a separate, larger decision).
- Add a real "edit identity" action to `DetectionCard.tsx` if/when correction
  data is wanted as a first-class signal rather than inferred from
  remove+manual-add pairs.

None of this is required for Phases 2-3 below (v0/v1 model training uses an
independently curated/photographed dataset, not app telemetry). It only
matters once real users are correcting a real model's predictions in
production (Phase 4/5 below) and that data is meant to feed retraining.

## 2. Staged model plan

### Model v0 - classification baseline

**Goal:** prove the complete training/evaluation/inference pipeline end to
end, not build a usable product feature yet.

- Scope: **10-15 common ingredient classes** (see §3 for the actual starter
  list and why).
- Whole-image classification (one label per image), transfer learning from a
  pretrained vision backbone (see §5 for the specific recommendation).
- Small curated dataset, explicit train/validation/test split.
- Report: confusion matrix, per-class precision/recall/F1.
- No mobile integration. No `IngredientInferenceProvider` wiring yet - this is
  training/eval code only, isolated in the `ml/` tree (§5).

### Model v1 - multi-object ingredient detection

**Goal:** move from "what's the one thing in this photo" to "what are the
several things in this photo," which is what a fridge/pantry/countertop photo
actually needs.

- Object detection: multiple ingredients per image, bounding boxes,
  per-detection confidence.
- Scope: **~20-30 classes**, expanding v0's set.
- Report: mAP, precision, recall, per-class metrics, false-positive rate,
  **and correction rate during SmartPrep review** once this is wired into a
  real (even if experimental/internal) build - this is where §1's feedback
  schema starts to matter.

### Model v2 - SmartPrep domain adaptation

**Goal:** the images v0/v1 train on (likely clean, single-subject, well-lit
reference photos) are not what SmartPrep's camera actually sees.

- Fine-tune on SmartPrep-realistic imagery: refrigerator shelves, pantry
  shelves, grocery bags, countertops, overlapping food, partial occlusion,
  poor lighting, multiple phone cameras.
- User-confirmed corrections may be used as labeled feedback **only under an
  explicit, future, opt-in privacy/data policy** - this roadmap does not
  assume user images may be used for training. That is a product/legal
  decision to be made explicitly before any user image is used this way, not
  an default this document sets.

### Model v3 - production inference integration

**Goal:** replace the OpenAI benchmark provider as SmartPrep's default.

Conceptually, a `POST /detect-ingredients`-shaped inference API (hosted
however v3's hosting decision lands - see §5) that SmartPrep's own
`SmartPrepModelProvider` (`lib/scan/providers/smartPrepModelProvider.ts`,
currently a stub that throws) calls and normalizes into the same
`IngredientInferenceResult` shape every other provider already returns.
Because `scanService`, Review, History, and Pantry confirmation only ever
depend on `IngredientInferenceProvider`, this integration is:

1. Implement `smartPrepModelProvider.detect()` for real.
2. Change `getActiveIngredientInferenceProvider()` (`lib/scan/providers/index.ts`)
   to return it.

No Scan UI, Review, History, or Pantry confirmation code changes required.

### Later, optional: hybrid strategy

Only after a real SmartPrep model exists and has a measured confidence
calibration:

```
high confidence        -> use SmartPrep model
medium confidence       -> ask user to verify (already the review-first flow)
very low confidence /
unsupported class       -> optional external fallback (OpenAI benchmark provider)
```

OpenAI is described here as an **optional fallback/benchmark**, never the
primary architecture, and never a silent auto-accept path - the review-first
guarantee (§ below) is unconditional regardless of which provider produced a
detection.

## 3. Starter label taxonomy (v0/v1)

Not scraping arbitrary/copyrighted datasets. Data sources, in order of
preference:

1. **Permissively licensed public food/ingredient image datasets** (e.g.
   datasets explicitly released for research/commercial use with a compatible
   license - to be identified and license-checked individually before use,
   not assumed).
2. **Manually photographed examples** - SmartPrep's own team photographing
   real ingredients in realistic conditions (the single highest-value source
   for v2's domain-adaptation goal specifically).
3. **Synthetic/augmentation** (rotation, lighting, crop, background swap)
   applied to (1)/(2), never as a substitute for real examples, only to
   stretch a small curated set further.
4. **User-contributed data** - later, and only with explicit, informed
   consent and a published data-use policy. Not assumed available for v0-v2.

**v0/v1 starter set (13 classes)**, chosen for visual distinguishability,
household commonality, and SmartPrep usefulness (produce, protein, and dairy
staples that appear across many recipes and are easy to tell apart visually -
deliberately excluding easily-confused near-duplicates like "yellow onion vs.
white onion" or "green pepper vs. red pepper" at this stage):

```
apple
banana
tomato
onion
potato
carrot
broccoli
spinach
egg
milk
bread
chicken (raw/packaged)
cheese
```

This is intentionally not 100+ classes. Expand class-by-class only as
data/accuracy justify it (§2's v1 target of ~20-30 classes should add the next
most-common, most-visually-distinct staples - e.g. rice, pasta, yogurt, bell
pepper, garlic - re-evaluated against actual v0 confusion-matrix results
rather than decided up front).

## 4. Training architecture recommendation (not started this pass)

| Approach | v0 fit | v1 fit | Notes |
|---|---|---|---|
| Image classification (transfer learning) | **Recommended for v0** | No (single-label only) | Fastest path to a working end-to-end pipeline; a pretrained backbone (e.g. an ImageNet-pretrained CNN/ViT via a standard framework) fine-tuned on the 13-class set. |
| YOLO-family detector | Not needed yet | **Recommended for v1** | Mature, well-documented, strong small/medium-dataset performance, straightforward export path (ONNX and others) if on-device inference is ever wanted. |
| DETR-style detector | Not needed yet | Possible alternative | Generally needs more data/training time to match YOLO-family accuracy at small dataset sizes; revisit if v1's data volume grows substantially. |
| Lightweight/mobile-friendly architectures (e.g. MobileNet/EfficientDet-lite class) | Not needed yet | Consider once v3 (production) approaches, especially for any on-device-inference ambition | Trade some accuracy for size/latency; only relevant once hosting/on-device tradeoffs (below) are being decided for real. |

**v0 recommendation:** a standard transfer-learning image-classification
baseline. Prioritize getting the full train -> evaluate -> report pipeline
working correctly over model sophistication.

**v1 recommendation:** a YOLO-family detector. It is the most practical
starting point for multi-object detection at small-to-medium dataset sizes,
has the most accessible tooling/tutorials for a first from-scratch object
detection effort, and has a clear path to ONNX export if on-device inference
is ever pursued.

**Development environment:**

- Primary development is on Windows; training itself should not assume local
  GPU availability. **Google Colab or Kaggle GPU notebooks** are the
  recommended path for v0/v1 training runs - free/cheap GPU access, no local
  CUDA/driver setup burden, good fit for the dataset sizes above.
- **Inference hosting** for v3 is an explicit later decision (options include
  a dedicated inference service the Edge Function calls, or a
  container/serverless GPU endpoint) - not decided in this pass.
- **On-device inference** (ONNX Runtime Mobile / TFLite / Core ML export) is a
  possible future optimization if latency/cost/offline-use ever justify it,
  not a v0-v3 requirement. Keep it in mind when choosing an architecture
  (YOLO-family exports reasonably to all three) but do not build for it yet.

**Repo isolation - do NOT add ML dependencies to the Expo app.** Recommended
future layout, sibling to `mobile/`:

```
ml/
  datasets/     # not committed - see .gitignore guidance below
  training/
  evaluation/
  inference/
  configs/
```

Training code, notebooks, and configs are versioned; datasets and model
weights are not. Nothing under `ml/` is a dependency of `mobile/`, and nothing
in `mobile/package.json` should ever need an ML library - `mobile/` only ever
talks to a trained model through an HTTP boundary
(`IngredientInferenceProvider` -> eventually `smartPrepModelProvider` ->
`POST /detect-ingredients` or equivalent).

**Future `.gitignore` guidance** (to add when `ml/` is actually created, not
added speculatively now):

```
ml/datasets/
ml/**/*.pt
ml/**/*.onnx
ml/**/*.tflite
ml/**/*.mlmodel
ml/**/checkpoints/
ml/**/runs/
```

## 5. Updated validation/deployment sequencing

See `docs/LIVE_VALIDATION.md` §2/§3 for the authoritative checklist state.
The next provider-validation sequence, in order:

1. USDA live validation (`usda-lookup`)
2. Barcode nutrition E2E (Open Food Facts + USDA exact-GTIN verification)
3. Receipt OCR / Textract validation, if receipt intake is wanted live
4. Custom ingredient model development (this document) - **separate track,
   not gating 1-3**
5. Ingredient scan integration, once custom inference is actually ready

`scan-ingredients` (OpenAI) deployment is **DEFERRED / OPTIONAL BENCHMARK** -
not part of the current production-readiness push. Ingredient scanning should
not be reported as production-live until a real `IngredientInferenceProvider`
(custom model or a deliberately-chosen interim provider) has been integrated
and tested end to end - the mere existence of the `scan-ingredients` function
and its passing unit tests is not that bar.

## 6. What this roadmap does not decide yet

- Which specific licensed dataset(s) to use for v0/v1 (needs individual
  license review, not a blanket assumption).
- Where v3 inference is actually hosted.
- Whether/when user-confirmed corrections are used for training, and under
  what consent/privacy terms - a product and legal decision, not a technical
  default.
- The exact v1 class expansion beyond the 13 starter classes - to be set from
  v0's actual confusion-matrix results, not decided speculatively here.

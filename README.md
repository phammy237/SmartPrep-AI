# SmartPrep AI

SmartPrep is a kitchen application built around one idea: pantry inventory,
groceries, recipes, meal planning, cooking, nutrition, and food-waste
tracking are the same underlying data, not five separate apps glued
together. An action in one area — buying groceries, cooking a recipe,
logging a meal — updates the same shared state the others read from,
instead of each feature keeping its own disconnected copy.

The mobile app is a React Native / Expo client over a Postgres (Supabase)
backend where the state-changing rules that matter (inventory math, cooking
deductions, grocery transfers) live in the database as transactional
functions, not client-side logic. A separate, standalone workspace (`ml/`)
is building SmartPrep's own ingredient-recognition model to eventually
replace a third-party vision API for the Scan feature.

## What's actually implemented, briefly

- **Pantry** with an append-only event ledger (`pantry_events`) - quantity
  and status can only change through database functions, never a direct
  client write.
- **Four ways to add food** - manual entry, a barcode lookup, receipt OCR,
  and a photo-scan path - all of which land in a review screen before
  anything is written to the pantry (see "Ingredient scanning" below for
  what's actually live vs. in progress on that last one).
- **Recipes, meal planning, and cooking** with FEFO (first-expiring-first-out)
  pantry deduction across multiple lots, and an atomic database transaction
  that deducts inventory, creates leftovers, and logs nutrition together or
  not at all.
- **A grocery lifecycle** (needed → planned → purchased → transferred to
  pantry) instead of a static shopping list, with an atomic transfer
  function that moves a purchased item into pantry inventory.
- **Nutrition tracking** with immutable meal-log snapshots - a logged meal
  is never silently edited in place; it's voided and replaced through a
  correction function that preserves the original.
- **Kitchen Impact metrics** derived entirely from the real pantry/cooking
  event ledgers, not a separately maintained counter.

None of this is aspirational - each of the above is backed by a real
Postgres migration and exercised by the test suite described below.

## Ingredient scanning: what's live, what isn't

Ingredient photo-scanning is intentionally built behind a provider
abstraction (`mobile/lib/scan/providers/`), not a hardcoded call to one
vision service:

- **In production, no ingredient-recognition provider is active by
  default.** Attempting a photo scan without one configured raises a
  specific, named "not available yet" error the UI can render, rather than
  silently failing or falling back to a fake result.
- **An OpenAI vision-based provider exists** (calls `gpt-4o-mini` through a
  Supabase Edge Function, deployed separately from the app) and can be
  turned on via an explicit feature flag - it's documented in the code as
  an opt-in benchmark, not SmartPrep's intended production path.
- **SmartPrep's own model provider is a deliberate stub.** It exists as an
  integration point in the code, but throws until a real model is trained
  and wired in - see `ml/README.md`.

This means the rest of the app (Review, Pantry confirmation, History) is
already built against a stable interface; swapping in a trained model
later is a one-line change, not a Scan-flow rewrite.

## Computer vision / ML pipeline

`ml/` is a standalone Python workspace, not yet imported by the mobile app.
It trains a ResNet18-based ingredient classifier for 13 household ingredient
classes and is currently at the **dataset stage**: no model has been trained
on real images yet.

What exists today is a reproducible dataset pipeline - acquisition scripts
for several licensed public image sources, a first-party photo-import
workflow, automated duplicate/near-duplicate detection, group-aware
train/val/test splitting (so related images can never leak across splits),
an independent leakage audit, and a one-command dataset report:

```text
Raw Sources → Acquisition + Provenance → Validation + Duplicate Clustering
    → Group-Aware Splitting → Statistics + Leakage Audit
    → Train/Val/Test Manifests → Training-Time Transforms
```

7 of 13 classes currently have real, licensed images; the dataset does not
yet meet the bar for a training run. See **[`ml/README.md`](ml/README.md)**
for the full pipeline, current dataset status, and how to reproduce it.

## Architecture

```text
        +---------------------------+
        |  React Native + Expo App  |
        |        TypeScript         |
        +---------------------------+
                     |
                     v
        +------------------------------+
        |           Supabase           |
        | Postgres . Auth . RLS . RPC  |
        +------------------------------+
                       |
                 +-------------------------------+
                 |                               |
                 v                               v
    +---------------------------+    +-----------------------------+
    |      Edge Functions       |    | ml/ workspace (standalone)  |
    |  OpenAI vision (opt-in)   |    |     ResNet18 classifier     |
    |       AWS Textract        |    | dataset stage, not trained  |
    |  USDA / Open Food Facts   |    +-----------------------------+
    +---------------------------+
```

The client never talks to an external API directly - OpenAI, AWS Textract,
and nutrition-lookup calls all go through Supabase Edge Functions, so
credentials never reach the app.

## Tech stack

**Mobile:** React Native, Expo (SDK 52), Expo Router, TypeScript, TanStack
Query, Zustand.

**Backend:** Supabase (Postgres, Auth, Row Level Security, Edge Functions),
15 version-controlled SQL migrations, PL/pgSQL RPCs for every
consistency-critical mutation.

**External integrations (implemented, invoked through Edge Functions):**
OpenAI vision (opt-in ingredient-scan benchmark), AWS Textract
(`AnalyzeExpense`, for receipt OCR), USDA FoodData Central / Open Food
Facts (barcode nutrition lookup).

## Backend & data-integrity highlights

- **Security-definer RPCs, not client writes, for anything that has to be
  atomic or auditable** - cooking completion, pantry-quantity changes,
  grocery-to-pantry transfers, and meal-log corrections are all Postgres
  functions, not sequences of client `.update()` calls that could partially
  fail.
- **Append-only ledgers.** `pantry_events` and `meal_logs` have no client
  UPDATE/DELETE grant at all; history is immutable by construction. A
  correction inserts a new, linked row rather than editing the old one.
- **Explicit shortfall handling.** If a recipe needs more of an ingredient
  than the pantry has, the system does not silently deduct what's
  available and call it done - it surfaces the exact shortfall and requires
  the user to resolve it.
- **Row Level Security** on every user-owned table, plus column-level
  grants that block a client from writing columns (like `pantry_items.quantity`)
  that are only supposed to change through an RPC.
- **Local session data is encrypted at rest** on-device (AES, Expo
  SecureStore-backed key) since a Supabase session routinely exceeds
  SecureStore's own size limit - a standard pattern for this stack, not a
  novel security feature.

## Testing & validation

Two independent test suites, not combined into one number:

| Scope | Count | How to run |
|---|---|---|
| Mobile app (Jest + TypeScript) | **884 tests, 63 suites** | `cd mobile && npx jest` |
| ML dataset pipeline (pytest) | **159 tests** | `cd ml && python -m pytest -q` |

The mobile suite also passes a strict `tsc --noEmit` type check with no
errors. Backend RLS policies additionally have a manual SQL verification
script (`mobile/supabase/tests/rls_verification.sql`) covering every phase
of the schema - it's run by hand against a linked Supabase project (it is
not an automated pgTAP suite executed in CI).

## Getting started

This is two independent workspaces; each has its own setup.

### Mobile app

```bash
cd mobile
npm install
npx expo start
```

Requires a Supabase project and environment configuration - see
[`mobile/README.md`](mobile/README.md) for the full setup, environment
variables, and a detailed tour of every backend workflow.

### ML workspace

```powershell
cd ml
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python scripts/audit_dataset.py
```

See [`ml/README.md`](ml/README.md) for the full pipeline and current
dataset status.

## Status

Active development. The mobile app's product flows (pantry, recipes,
planning, cooking, grocery, nutrition) are built against a real backend and
covered by the test suite above. The custom ingredient-vision model is at
the dataset-acquisition stage, not the training stage.

## Author

**My Pham**
Data Science @ University of Florida
[mypham.space](https://mypham.space)

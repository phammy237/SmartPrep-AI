# SmartPrep AI

SmartPrep AI turns your fridge, freezer, and pantry into a living inventory: scan your kitchen, get recipes ranked by what you already have, build a grocery list for what's missing, and track nutrition against your goals.

Built with [Expo](https://expo.dev) (React Native + [Expo Router](https://docs.expo.dev/router/introduction) for file-based navigation) and TypeScript.

## Get started

```bash
npm install
npx expo start
```

From the Expo CLI output you can open the app in a [development build](https://docs.expo.dev/develop/development-builds/introduction/), an Android emulator, an iOS simulator, [Expo Go](https://expo.dev/go), or the web (`npx expo start --web`).

## Project structure

```
app/                 Expo Router routes - each file is a screen/route, kept thin
features/<name>/     Screens and feature-local components, grouped by product area
  screens/             the actual screen components rendered by app/ routes
  components/          components used only within this feature
components/          Shared, cross-feature UI components (Button, Card, Chip, TextField, ...)
hooks/               React Query hooks wrapping the services layer
services/            Data-access layer - all Supabase-backed (services -> lib/supabase/repositories -> Supabase)
lib/                 Backend-adjacent infra: Supabase client/auth, repositories, validation schemas, nutrition/unit engine
store/               Zustand stores for client-only state (onboarding draft, scan session, hasOnboarded flag)
data/                The canonical ingredient catalog (data/ingredients.ts) - identity resolution + conversion metadata
types/               Shared TypeScript types, incl. generated database.types.ts
utils/               Pure helper functions (formatting, nutrition math, freshness, dates)
supabase/
  migrations/          committed SQL migrations, applied with `supabase db push`
  tests/               SQL scripts for verifying RLS policies against a live project
```

Screens should stay declarative: data comes from `hooks/`, mutations go through `hooks/`, and one-off pure logic belongs in `utils/`, not inlined in a screen.

### Data layer

**Identity/preferences (`authService.ts`, `userService.ts`), pantry (`pantryService.ts`), and recipes/planning/cooking/prepared-meals/meal-logging (`recipeService.ts`, `plannerService.ts`, `cookingService.ts`, `preparedMealService.ts`, `mealLogService.ts`) are backed by a real Supabase project** - see [Backend (Supabase)](#backend-supabase) below.

**Every product flow is now backed by a real Supabase project.** `hooks/` wrap each service in [TanStack Query](https://tanstack.com/query); services call repositories in `lib/supabase/repositories/`; screens never touch Supabase directly. `services/kitchenImpact` derives its numbers from the real `pantry_events` / `cooking_events` ledgers (no separate store).

The in-memory mock backend is **gone**: `services/mockDb.ts`, `services/apiSimulation.ts`, and the dead seed data (`data/mockRecipes.ts`, `data/mockMealPlan.ts`, `data/mockPantry.ts`, `data/mockUser.ts`) were deleted once a repo-wide audit proved no production path imported them. `data/` now exports only `data/ingredients.ts` (the canonical ingredient catalog, used everywhere for identity resolution and conversion metadata). The real recipe catalog lives in the database, seeded by `supabase/migrations/0004_recipe_catalog_seed.sql`.

**Scan runs real vision + persists to the real pantry.** `scanService.processCapture` sends the captured photo (base64, JPEG ~q0.4) to the authenticated `scan-ingredients` Edge Function, which calls an OpenAI vision model with a strict JSON schema; `OPENAI_API_KEY` is an Edge Function secret only (never `EXPO_PUBLIC_*`), the image is transient (never stored/logged). Detections are validated client-side (Zod), canonical-resolved (exact-only), unit-normalized, and confidence-gated into the Review screen. The **user must confirm every detection** - a missing/uncertain quantity or a non-persistable unit blocks confirmation. `confirmScan` then creates each item through the same `pantryService.createScanItem` path a manual add uses; a rejected row surfaces as `ScanConfirmError`. An inference failure NEVER falls back to canned demo detections - it shows an honest retry / manual-entry path. Not deployed: `npx supabase functions deploy scan-ingredients` + `npx supabase secrets set OPENAI_API_KEY=...` are still required.

**Scan history + idempotent confirmation (Phase 6, `0008_scan_history.sql`).** A confirmed scan is now a durable per-user record across three tables: `scans` (one row per session), `scan_sections` (guided scans only - which of fridge/freezer/pantry were engaged or skipped), and `scan_detections` (the user-**confirmed** name/quantity/unit/category for each kept detection, plus the `pantry_item_id` it created). **What is stored:** structured confirmed results only. **What is not:** the scan photo, any base64/data URL, and any raw model payload - scan images stay transient exactly as in Phase 5. All three tables are RLS-scoped to the owner (`scans` by `user_id`; the child tables through their parent `scans` row) and are written **only** by security-definer RPCs - there is no client insert/update grant.

`confirmScan` is a **durable, resumable** flow, safe to retry after any partial failure or a lost response:

1. `begin_scan_confirmation(client_scan_id, mode, sections, detections)` - upserts the `scans` row keyed by `(user_id, client_scan_id)` (the stable id from the in-memory Review session, reused across retries so a retry **resumes** the same scan, never forks a new one) plus one `scan_detections` intent row per kept detection. It prunes only still-pending intent rows for detections the user removed between retries; a detection that already has a `pantry_item_id` is frozen.
2. per detection - `pantryService.createScanItem` (the **same** shared path as a manual add) is called with the detection id as `p_source_scan_detection_id`. `pantry_items.source_scan_detection_id` has a **unique** partial index, and `create_pantry_item` returns the existing row (no second item, no second `added` event) when one already exists for that key - so a lost response after a successful insert is recovered by the next attempt. `link_scan_detection` then records the `pantry_item_id`.
3. `finalize_scan_confirmation(scan_id)` - flips the scan to `confirmed` once every detection is linked; a no-op while any is still pending, and it keeps the original `confirmed_at` on repeat calls.

**Retry semantics:** a `pantryService` failure leaves the scan `confirming` and throws `ScanConfirmError` with partial counts - it does **not** roll back the items that persisted. The next Confirm re-runs `begin`, skips detections already linked, and re-attempts only the pending ones. A `finalize` failure is likewise reconcilable: the retry skips creation entirely and just re-finalizes. Duplicate Confirm taps and screen remounts converge because every step is DB-keyed, not React-state-keyed. History is read back through `scanHistoryRepository` (`fetchConfirmedScans` / `fetchScanDetail`) and shown on `/scan/history` (list) and `/scan/history/[id]` (detail) - a neutral no-photo treatment, since no image is kept.

**Backlog - re-add from history.** There is no "add these items again from a past scan" action. It would need a new detection→pantry re-confirmation UX and was out of scope for Phase 6; the data model (`scan_detections` with canonical id / quantity / unit) already supports building it later.

**Backlog - Scan image downscaling.** `CaptureScreen` compresses with `takePictureAsync({ quality: 0.4 })` and hard-rejects a base64 payload over `MAX_SCAN_IMAGE_BASE64_CHARS`, but does not downscale to a target longest-edge (that needs `expo-image-manipulator`, not currently a dependency). Adding it would let large captures succeed instead of erroring.

### Pantry (Phase 2)

**Quantity invariant:** `pantry_items.quantity` is always the current on-hand amount and can never be negative (DB `check (quantity >= 0)`). Reaching exactly zero always means `status = 'depleted'`; moving back above zero always means `status = 'active'`. Quantity and status can only change through five Postgres RPCs (`create_pantry_item`, `adjust_pantry_quantity`, `deplete_pantry_item`, `restore_pantry_item`, `confirm_pantry_item`) - see `supabase/migrations/0002_pantry.sql` for why these are `security definer` (the one deliberate exception to "prefer security invoker" elsewhere in this codebase) and column-level grants block plain client `.update()` calls from touching those two columns directly. (`0008_scan_history.sql` rebuilds `create_pantry_item` with one added optional arg, `p_source_scan_detection_id` - null for manual/grocery adds; when set it makes the call idempotent for that scan detection.) Everything else (name, category, unit, notes, storage location, dates) is a plain RLS-protected client `.update()`, since those edits don't need a matching ledger entry.

**Event ledger:** `pantry_events` is an append-only history of everything that has happened to an item (`added`, `adjusted`, `consumed`, `depleted`, `discarded`, `corrected`, `restored` are actively written by Phase 2; `deducted_by_cooking` is written by Phase 3's `complete_cooking_event` RPC, referencing the cooking event as its source entity; `donated`/`traded` are reserved, unwritten until the community-exchange phase). No role has an UPDATE or DELETE grant on `pantry_events` at all, not even the owning user - history is immutable by construction, not just by convention.

**Expiration semantics** (`utils/expiration.ts`) - three distinct concepts, never conflated:
- `purchaseDate` / `openedDate` - user-provided, informational only.
- `userProvidedDate` (+ `best_by`/`use_by`/`sell_by` type) - exactly the date printed on the package, as the user typed it. Never a food-safety deadline, always shown as guidance ("Best by ...").
- `estimatedExpirationDate` - a system estimate: the user-provided date if there is one (confidence `high`), else `purchaseDate` + a generic per-category shelf-life heuristic (confidence `medium`), else nothing at all (confidence `unknown` - never fabricated).

Urgency shown in the UI (`FreshnessTag`/`FreshnessTimeline`, unchanged components) is derived deterministically from that estimate + confidence: ≤2 days out (or already past) = Prioritize, 3-5 days = Use Soon, further out = Fresh, and unknown confidence always renders as "Can't Tell" regardless of any date - the app never asserts urgency it isn't confident about.

**Timezone:** "today," for expiration-urgency purposes, is computed in the user's stored `profiles.timezone` (IANA name, e.g. `America/New_York`), not device-local time - so the same item shows the same urgency regardless of which device you're on. Falls back to UTC if the profile hasn't loaded yet or the stored value isn't a recognized IANA zone.

**Supported units:** `item`, `container`, `bag`, `bottle`, `can`, `package`, `serving`, `g`, `kg`, `oz`, `lb`, `ml`, `L` - the same set the UI already offered. There is no unit-to-grams conversion in Phase 2; `estimated_grams`/`fdc_id`/`usda_match_confidence`/`barcode`/`brand` columns exist and are reserved for the USDA-matching phase, but nothing populates them yet, and nothing pretends a "3 items" quantity has a known mass.

**Known Phase 2 limitations:**
- Dates are entered as plain `YYYY-MM-DD` text (no native date picker dependency was added).
- Once a date is set, the detail screen can change it but can't clear it back to empty - clearing requires setting a new date instead.
- Notes can only be set when adding an item, not edited afterward, from the current UI.
- `supabase/tests/rls_verification.sql` has not been executed against a live project (none is linked in this environment) - see [Backend (Supabase)](#backend-supabase).

### Recipes, planning, and cooking (Phase 3)

**Six distinct events, never conflated:** saving a recipe, planning a meal, starting/completing cooking, preparing servings, consuming food, and logging nutrition are separate tables and separate mutations. A planned meal (`meal_plan_items`) never counts toward consumed calories/macros - only `meal_logs` does. Completing a cooking event does not imply every prepared serving was eaten - `prepared_meals` tracks the leftover balance separately, and `meal_logs` only ever records the servings actually logged.

**Recipe identity vs. immutable versions:** `recipes` is stable identity + provenance (owner, source, visibility, `trust_label`); `recipe_versions` is the immutable content (title, servings, instructions, ingredients, nutrition snapshot) that planning/cooking/logging always reference by exact version id, never by "the recipe" generically. A recipe's content can never change out from under a plan, a cooking session, or a historical log.

**Recipe trust labels:** `source_tested`, `community_tested`, `ai_experimental`, `user_created`, `demo`. Every recipe seeded in Phase 3 is `trust_label = 'demo'` - this app makes no provenance claim beyond "authored as sample content." There is no recipe-authoring UI yet, so `user_created`/`ai_experimental`/`source_tested`/`community_tested` are schema-only, reserved for later phases (recipe creation, Phase 5 external import/AI adaptation).

**Nutrition is estimated, not verified:** every `recipe_versions.nutrition_status` is `'estimated'` or `'incomplete'`, never `'verified'` - there is no USDA (or other authoritative) nutrition integration yet (Phase 4). The shared nutrition-snapshot contract (`lib/validation/nutritionSchemas.ts` on the client, `is_valid_nutrition_snapshot`/`scale_nutrition_snapshot` in `0003_recipe_planning_cooking.sql` on the database - kept in sync by hand) treats every individual nutrient as optional: unknown means null/absent, never a fabricated zero. Only `status` is required, and at least one nutrient must be known. `utils/nutritionSnapshot.ts` has the pure functions that scale/sum/total these snapshots without ever turning "unknown" into "zero," plus a macro-calorie consistency check (`4P + 4C + 9F` vs. stated calories) that only runs when all four are known and only ever produces a warning, never a rejection.

**Cooking-event lifecycle:** `cooking_events.status` moves `started -> completed | cancelled`, exclusively through three security-definer RPCs (`start_cooking_event`, `cancel_cooking_event`, `complete_cooking_event`) - the table has no plain client insert/update grant at all, because that transition gates pantry deduction and prepared-meal creation and needs stronger guarantees than a column grant can express (the same reasoning as Phase 2's pantry `quantity`/`status`). **A cooking event is created only by an explicit "Start Cooking" press** in `CookingModeScreen` - never merely by navigating to `/recipes/[id]/cook` - and that press sends a client-generated idempotency key that's reused for the lifetime of the screen, so a retry after a dropped response returns the same event instead of creating a duplicate.

**Atomic pantry deduction:** `complete_cooking_event` is one trusted database transaction that validates ownership, actual servings prepared, and every confirmed deduction (exact unit match required - Phase 3 has no unit-conversion table, so an incompatible unit is never silently converted, only skipped or corrected by the user); rejects the *entire* completion if any single deduction is invalid or exceeds current pantry stock; updates pantry quantities, writes matching `pantry_events` rows (`deducted_by_cooking`, referencing the cooking event), writes the `cooking_event_ingredients` ledger (which deductions were skipped and why), marks the event completed, creates the `prepared_meals` balance for the whole batch actually cooked, optionally creates one `meal_logs` row for servings consumed immediately, and updates the linked plan item - all or nothing. A second completion attempt on the same event is rejected outright (not silently re-applied), so duplicate submissions cannot double-deduct.

**Prepared-meal balance:** `prepared_meals.servings_remaining` (and optional `remaining_batch_weight_g`) can only ever decrease, via `log_prepared_meal_consumption` (also security definer, also idempotency-key aware for safe retry) - it locks the balance, rejects consumption exceeding what remains, and marks the meal `consumed` at exactly zero. The minimal "Leftovers" screen (`/prepared-meals`, linked from Nutrition & Progress) stays reachable after leaving the cooking flow so a serving logged later isn't stranded.

**Immutable meal-log snapshots + correction model:** `meal_logs` has no client insert or delete grant at all (every row comes from `complete_cooking_event`, `log_prepared_meal_consumption`, `quick_add_meal_log`, or `correct_meal_log`, all security definer). A plain client update is restricted, at the column-grant level, to exactly two fields (`voided_at`, `void_reason`) - and a trigger (`protect_meal_log_immutability`) additionally enforces that voiding can only happen once (no re-voiding, no un-voiding) and that every other column, including `replaced_by_log_id`, is frozen. **Correction model: soft-void, never a silent in-place edit and never a hard delete.** The UI's "Remove" action on a logged meal voids it through that restricted path (no replacement). The UI's "Correct" action (the pencil icon on a recent log, `features/nutrition/components/CorrectMealLogModal.tsx`) opens a pre-filled form for meal type, macros, servings, notes, and consumed time; requires a reason; requires an explicit "Save Correction?" confirmation; and calls the `correct_meal_log` RPC, which voids the original and inserts a typed replacement atomically in one transaction - `replaced_by_log_id` can never be a client-supplied value. The original's `nutrition_snapshot` is never touched; totals only ever pick up the non-voided replacement (a corrected log is never double-counted with its voided original). Correcting an already-voided/corrected log is rejected server-side, and since voided logs are filtered out of the "Recent" list, the UI never even offers to correct one twice.

**Timezone and date-boundary behavior:** daily/weekly nutrition totals use each meal log's `local_date` (computed server-side, inside the relevant RPC, from the user's `profiles.timezone` - falling back to UTC if unset, the same documented fallback Phase 2 established for expiration urgency). Weeks are Monday-start (`utils/nutritionSnapshot.ts#localWeekRange`), matching the existing "Generate My Week" convention. Nutrition & Progress's Month view uses a real calendar-month date range (`utils/nutritionSnapshot.ts`), not a scaled projection of the week - the previously-noted `4.345`-weeks-vs-`×30`-days inconsistency doesn't reappear here because Month now queries real logged data over a real calendar range instead of scaling anything.

**Demo recipe catalog:** `supabase/migrations/0004_recipe_catalog_seed.sql` seeds the same 16 recipes previously only in `data/mockRecipes.ts` as real `recipes`/`recipe_versions`/`recipe_ingredients` rows - `owner_id` null (system/catalog-owned), `visibility = 'public'`, `trust_label = 'demo'`, `nutrition_status = 'estimated'`. This is global catalog data, not per-user data, so seeding it via migration doesn't insert anything into any individual user's account. `smartMatchScore` (the "X% match" badge) is computed at read time from live pantry overlap, not stored; `tags`/`cuisines`/`collections`/the "why this works" reasons/the cost estimate are static authored display copy carried over unchanged from the mock content, not a recommendation or ranking system.

**Pantry-ingredient matching is user-reviewable, never silent, and never silently short-fills:** the cooking-flow review screen proposes a pantry match per ingredient (exact `ingredientId` match, same-unit required for an automatic default) and lets the user change it via a picker (`features/recipes/components/PantryItemPickerModal.tsx`) listing their own active, in-stock pantry items - an incompatible-unit or depleted item is shown disabled, never selectable, so the app can never silently pick one.

`utils/nutritionSnapshot.ts` models this as an explicit state machine (`autoResolvePantryMatch` / `confirmPartialDeduction` / `skipPantryDeduction` / `rescalePantryMatch`), not a clamp-and-forget calculation. Four values are always kept distinct and never collapsed into each other: the **required** quantity for the batch actually being cooked, the pantry item's **available** quantity, the quantity **deducted** (what will actually leave the pantry), and the **uncovered** remainder (what's being sourced from elsewhere). If the selected item has enough stock, the deduction auto-resolves to `'full'` (matching "exact same-unit deduction may be automatic after explicit cooking confirmation" - pressing Finish is that confirmation). If it doesn't, the row stops at `'needs_decision'`, displaying the exact shortfall, and **the Finish button is hard-blocked** until every such row is explicitly resolved by choosing one of: pick a different pantry item (re-resolved fresh, from scratch, against the new item's live stock); confirm deducting the available partial amount (an explicit, disclosed `'partial'` resolution - `deductedQuantity` stays at what's actually available, `uncoveredQuantity` records the rest, and the UI never labels this "full"); skip the ingredient entirely; or back out and reduce servings prepared. Changing servings prepared recalculates the required quantity for every row while preserving an intentional manual remap (the same pantry item stays selected) - but it always re-resolves from scratch, so a prior `'partial'` confirmation is invalidated and must be explicitly reconfirmed if the new required amount still isn't fully covered. A manual remap is marked confidence `'likely'` (vs. `'exact'` for the original catalog-id auto-match). Only the final, user-confirmed resolution for each ingredient is sent to `complete_cooking_event`, which independently re-validates live stock at commit time regardless of what the client believed - the whole transaction is rejected (not partially applied) if anything no longer fits.

**Security-definer RPCs added in `0003_recipe_planning_cooking.sql`** (all: derive identity from `auth.uid()`, reject a null `auth.uid()`, re-check row ownership explicitly since RLS does not apply inside a security-definer function, lock `search_path` to `''`, grant execute to `authenticated` only and explicitly revoke from `public`):
- `start_cooking_event` - the only way a cooking event is created; idempotency-keyed.
- `cancel_cooking_event` - only from `started`.
- `complete_cooking_event` - the big atomic operation described above.
- `log_prepared_meal_consumption` - the atomic prepared-meal balance decrement + log insert.
- `quick_add_meal_log` - idempotency-key required; works without a recipe.
- `correct_meal_log` - void + typed atomic replacement; the only path that can ever populate `replaced_by_log_id`.

**No product flow uses mock data anymore.** Grocery, kitchen impact, scan, meal plan, and recipes all hit Supabase. `data/` keeps only the ingredient catalog.

### Meal Plan → Grocery

`plannerService.getPlanGroceryDemand(weekStart, weekEnd, tz)` computes **whole-week** grocery demand and `groceryService.applyPlanGroceryDemand(demand)` persists it; `hooks/usePlanner.ts#useAddWeekToGroceryList` chains the two, and the Plan screen's **"Add Week to Grocery List"** button runs it.

- **Aggregate, then subtract once.** Every `status = 'planned'` entry's recipe requirements are servings-scaled (`plannedServings / recipe.servings`) and summed per canonical ingredient *before* any pantry comparison. The combined requirement is handed to the shared `computeIngredientCoverage` engine exactly once against the ingredient's full lot set - so if recipe A needs 300 g chicken, B needs 400 g, and the pantry has 250 g, the shortfall is **450 g**, never A:50 + B:150 = 200 (which would spend the same 250 g twice). See `lib/nutrition/planDemand.ts`.
- **Units.** Calls in one convertible category combine deterministically with no metadata (`300 g + 0.5 kg → 800 g`; `200 ml + 0.3 L → 500 ml`). Cross-category calls combine only when ingredient conversion metadata (density / per-unit weight) supports it, via grams. Anything that can't be combined stays a **separate** demand segment - never force-converted. All math goes through `lib/nutrition/conversion.ts`.
- **Pantry lots.** `lib/nutrition/pantryLots.ts` (extracted from `recipeService`, now shared) matches by canonical id first, exact normalized name only when there's no catalog id, and excludes depleted / zero / inactive stock.
- **Lines written.** `source = 'meal_plan'`; `uncovered_shortfall` for a real partial gap; conservative `recipe_requirement` for `missing` **and** `unresolved` (never a silent subtraction, never "pantry has zero"). Each line carries every contributing `recipe_version_id` and `planGenerationKey` (`mealplan_<weekStart>_<weekEnd>`) in `source_metadata`. Unresolved lines set `needsQuantityCheck` (a subtle "Check quantity" hint in the grocery row).
- **Idempotency by reconciliation.** Each run first deletes *this plan key's* still-unchecked `meal_plan` lines (`deletePlanGeneratedGroceryItems`), then re-inserts the freshly computed set. Tapping "Add Week" twice, a screen remount, or a retry after a partial write all converge - never doubled demand. Manual lines, checked lines, recipe-detail (`source = 'recipe'`) lines, and other weeks' plan lines are never touched. Recipe-detail "Add to Grocery" now merges only into other `recipe` lines (not `meal_plan` ones) so the two mechanisms stay independent.
- **No migration needed** - `grocery_list_items` already has `source = 'meal_plan'`, `quantity_basis`, `source_recipe_version_ids`, and a free-form `source_metadata` jsonb.

**Backlog:** "re-add a past week", and the inherent overlap when the same recipe is added both from its detail screen and via a week that contains it (two independent user actions; not deduped across mechanisms).

**Known Phase 3 limitations:**
- No recipe-authoring UI - all recipes come from the Phase 3 demo seed; `recipes`/`recipe_versions`/`recipe_ingredients` have no client insert/update grant at all.
- No unit-conversion table - an incompatible-unit pantry item is never selectable in the remap picker and is never auto-converted; the only options for a unit mismatch are skipping the ingredient or choosing a different, unit-compatible pantry item.
- `prepared_meals.status = 'discarded'` is schema-supported (mirroring `pantry_events`' reserved `donated`/`traded`) but has no UI path to reach it in Phase 3.
- `supabase/tests/rls_verification.sql`'s Phase 3 section has not been executed against a live project (none is linked in this environment) - see [Backend (Supabase)](#backend-supabase).

**Phase 4 will implement:** USDA (or equivalent) nutrition lookup, so `nutrition_status` can legitimately become `'verified'` for matched ingredients, plus real gram-based unit conversion.

`lib/` holds backend-adjacent, cross-feature infrastructure that isn't tied to one product area:

```
lib/
  supabase/          Supabase client, secure session storage, AuthProvider context
    repositories/      typed CRUD wrappers around specific tables
  validation/        zod schemas (auth forms, preference/goal inputs)
  errors/            user-safe error message mapping
```

## Backend (Supabase)

### One-time project setup

1. Create a free project at [supabase.com](https://supabase.com) (needs a Supabase account - anyone on the team can create the project, then invite others).
2. Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from **Settings > API** in the new project.
3. Link the Supabase CLI to the project (run from `mobile/`):

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   ```

4. Apply the migrations:

   ```bash
   npx supabase db push
   ```

5. Regenerate TypeScript types from the real schema (overwrites the hand-authored stand-in committed at `types/database.types.ts`):

   ```bash
   npx supabase gen types typescript --linked > types/database.types.ts
   ```

6. Verify Row Level Security is actually enforced: open `supabase/tests/rls_verification.sql`, follow the instructions at the top of that file (create two throwaway test accounts, substitute their UUIDs), and run it in the Supabase SQL editor. A clean run to the bottom - ending in `ALL RLS CHECKS PASSED` - means every check passed.

### Local development

The Supabase CLI is available via `npx supabase` and works without any global install. **Local Supabase (`supabase start`) requires Docker Desktop**, which was not available in the environment this was built in - development so far has targeted the linked hosted project directly (steps above). If you have Docker installed, local dev works the normal Supabase way:

```bash
npx supabase start          # spins up local Postgres + Auth + Studio
npx supabase db reset       # applies supabase/migrations/ to the local DB
```

and point `.env` at the local URL/anon key printed by `supabase start` instead of the hosted project.

### Adding a migration

Never hand-edit a migration that's already been applied to a shared project. Create a new one:

```bash
npx supabase migration new <description>
# edit the generated file in supabase/migrations/
npx supabase db push
npx supabase gen types typescript --linked > types/database.types.ts
```

### What's backend-only (never in this app)

The `EXPO_PUBLIC_*` variables above are the only Supabase config the app needs, and are safe to ship (every table they can reach is behind Row Level Security). `OPENAI_API_KEY`, `USDA_API_KEY`, and `THEMEALDB_API_KEY` are listed commented-out in `.env.example` for visibility only - they belong in Supabase Edge Function secrets once Phase 5 adds the functions that use them:

```bash
npx supabase secrets set OPENAI_API_KEY=sk-...
npx supabase secrets set USDA_API_KEY=...
npx supabase secrets set THEMEALDB_API_KEY=...
```

They are never read by the mobile client and must never be prefixed `EXPO_PUBLIC_`.

## Scripts

```bash
npm start            # expo start
npm run ios          # expo start --ios
npm run android      # expo start --android
npm run web          # expo start --web
npm test             # jest --watchAll
npm run lint         # expo lint
npm run typecheck    # regenerate Expo Router's typed routes, then tsc --noEmit
npm run gen:route-types  # just the route-type regeneration step
```

### Typed routes (`npm run typecheck`)

`experiments.typedRoutes` (`app.json`) makes `expo-router` generate `.expo/types/router.d.ts` - a gitignored, machine-generated file that must never be hand-edited. It is only ever (re)written by the Metro **dev server** (`expo start`); `expo export` never triggers it, so adding/removing/renaming a route and then running `npx expo export` or a bare `npx tsc --noEmit` can type-error against a stale route list even though nothing is actually wrong.

`scripts/generate-route-types.js` boots `expo start --web` just long enough for it to (re)write that file - which is pure filesystem route discovery, so it works with no `.env`/Supabase connection at all - then kills the dev server and exits. `npm run typecheck` runs that and then `tsc --noEmit`; use it (not a bare `tsc`) after adding/removing a route, and in CI.

## Testing

Tests live in `__tests__/` folders next to the code they cover (e.g. `utils/__tests__/nutrition.test.ts`) and run on [jest-expo](https://www.npmjs.com/package/jest-expo). Run once with:

```bash
CI=1 npx jest --watchAll=false
```

This covers pure logic (nutrition/date math, zod schemas, repository row-mapping against a mocked Supabase client) - it does not and cannot exercise real RLS policies, since that requires a live Postgres instance. Run `supabase/tests/rls_verification.sql` against a linked project for that (see [Backend (Supabase)](#backend-supabase)).

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction)
- [TanStack Query](https://tanstack.com/query/latest)

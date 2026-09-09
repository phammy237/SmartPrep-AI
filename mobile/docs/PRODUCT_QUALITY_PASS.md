# Product Quality / UX Cohesion pass - final report

A single audit + fix pass across SmartPrep AI. No new product features. Goal: make
the existing app read as one coherent, honest product for a portfolio demo, user
testing, and eventual TestFlight.

**Constraint honored:** nothing was committed or pushed. All changes are in the
working tree for you to review and commit yourself.

---

## 1. Validation results

| Command | Result |
|---|---|
| `CI=1 npx jest --watchAll=false` | **864 passed / 864**, 61 suites (was 856 / 59 - only additions, no suite removed or weakened) |
| `npx tsc --noEmit` | **exit 0** |
| `npm run typecheck` | `gen:route-types` still times out in this environment (pre-existing - it boots the Metro dev server, which never comes up headless here); the `tsc --noEmit` half is **exit 0**. Run it once on a machine that can start `expo start`. |
| `npx expo lint` | **exit 0**, no warnings |

## 2. What changed, by area

### Home
- **Removed the duplicate "urgency" model.** Home showed *both* `UseFirstSection`
  (pantry items to use) and `UseSoonSection` (recipe recommendations) - two lists
  that looked like the same feature. `UseFirstSection` is deleted; pantry urgency
  is now one compact tappable line ("N pantry ingredients need attention" →
  Pantry, pre-filtered). `UseSoonSection` (recipes) stays.
- **Removed the duplicate Scan entry point.** `ScanHeroCard` on Home duplicated
  the center Scan tab button. Deleted.
- **Filled three navigation dead-ends.** `/grocery` was reachable only from
  Planner; `/recipes` (browse) and `/prepared-meals` were effectively orphaned.
  Home now has a shortcut row (Recipes / Grocery List / Leftovers) and an
  "All recipes" action on the recipe carousel.
- Files: `features/home/screens/HomeScreen.tsx` (rewritten),
  `features/home/components/UseFirstSection.tsx` + `ScanHeroCard.tsx` (deleted),
  `features/home/components/ImpactSummaryCard.tsx`.

### Add-to-Pantry (Scan hub)
- Renamed **"Scan Your Kitchen" → "Add to Pantry"** - the screen is the hub for
  *all* intake methods, not just the camera.
- Added an **"Add Manually"** option as the first row (was previously only
  reachable by knowing the Pantry "+" existed).
- File: `features/scan/screens/ScanModeSelectScreen.tsx`.

### Pantry
- The Pantry list now accepts a `?filter=use_soon` param so the Home attention
  line lands you on exactly the right subset. The filter uses the same shared
  predicate as Home (below), so the count on Home and the list on Pantry can
  never disagree.
- File: `features/pantry/screens/PantryScreen.tsx`.

### Planner
- Added a one-line explanation under the generator:
  *"Generate My Week favors food you already have and ingredients to use soon."*
  The button previously gave no hint what it optimizes for.
- File: `features/planner/screens/PlannerScreen.tsx`.

### Recipe detail
- Removed a dead **"Swap Ingredients"** button that only opened an
  `Alert("...coming soon")`. Ghost affordance, gone.
- File: `features/recipes/screens/RecipeDetailScreen.tsx`.

### Prepared Meals (Leftovers)
- The "Log Serving" mutation had no error handler - a failure was silent. Added
  an inline `Alert` on error.
- File: `features/preparedMeals/screens/PreparedMealsScreen.tsx`.

## 3. Terminology consolidation

One vocabulary for freshness across every surface (`utils/freshness.ts`,
`FRESHNESS_META`):

| Was (mixed) | Now |
|---|---|
| "Use First" / "Prioritize" | **Use now** |
| "Use Soon" (inconsistent casing) | **Use soon** |
| "Can't Tell" | **No date** |
| "Kitchen Activity" (Home) vs "Kitchen Impact" (Profile) | **Kitchen Impact** everywhere |

The internal `FreshnessLabel` union (`'prioritize' | 'use_soon' | ...`) and the
`theme.colors.freshness.prioritize` semantic danger token are **unchanged** -
this was a display-copy change only, so no tests or theme references broke.

## 4. Navigation tree (audited)

```
(tabs)
  home            Home
  pantry/         list · pantry/[id] detail · pantry/add manual add
  scan            "Add to Pantry" hub  ─┬─ scan/capture → processing → review → summary
                                        ├─ scan/barcode/scan → barcode/review
                                        └─ scan/receipt/capture → processing → review
  plan            Planner
  profile         Profile  (→ nutrition, → prepared-meals)
non-tab (stack)
  grocery/        list · grocery/history · grocery/history/[id]
  recipes/        browse · recipes/[id] · recipes/[id]/cook
  prepared-meals/ Leftovers
  scan/history/   list · scan/history/[id]
  nutrition/      Nutrition & Progress
  auth/reset-password
  onboarding/     welcome → signin → email → dietary → allergies → food-preferences
                  → cooking-profile → goals → priorities → first-scan
```

**Findings fixed:** `/grocery`, `/recipes`, `/prepared-meals` had no path from the
primary surface (Home) - now linked. **Remaining:** `/scan/history` and
`/grocery/history` are reachable only from icons in their respective screens'
headers; that's acceptable (history is secondary) but worth a design look.

## 5. Loading / error / empty states

Spot-checked the screens flagged as risky. `PantryItemDetailScreen`,
`ScanHistoryScreen`, `GroceryHistoryScreen`, `PreparedMealsScreen` all have
distinct loading / error (with Retry) / empty states. No raw error strings from
Supabase or AWS reach the user on the auth path (`toUserSafeAuthMessage` maps a
known allow-list; everything else becomes a generic message).

**Remaining:** the cooking-completion path (`CookingModeScreen`) surfaces the
server's domain message verbatim (e.g. *"insufficient pantry stock for Chicken
(have 1, need 2)"*). These are our own `raise exception` strings, written for
humans and genuinely useful (they name the item + amounts), and they're always
prefixed ("Could not finish cooking: …"). Left as-is; a friendlier mapping layer
is a reasonable later polish but not a leak of infrastructure detail.

## 6. Dead code / mock / TODO audit

- Deleted: `UseFirstSection.tsx`, `ScanHeroCard.tsx`, the "Swap Ingredients"
  ghost button.
- Mock backend was already fully removed in an earlier phase (`mockDb.ts`,
  `apiSimulation.ts`, `data/mock*.ts` gone; `data/` is just the ingredient
  catalog). Re-verified: no production path imports anything mock.
- No `TODO`/`FIXME`/`coming soon` affordance left wired to a user-visible control
  after the Swap-Ingredients removal.

## 7. Query keys & cache invalidation

**Consolidated duplicate logic (`hooks/invalidatePantryDerived.ts`, new).** The
"invalidate every pantry-derived surface" block (`pantry`, `recipes`,
`recipeCollections`, `readyToCookCount`, `recommendations`) was copy-pasted into
**six** hooks with drift between copies. It's now one helper with one doc comment,
called from `usePantry`, `useBarcode`, `useReceipt`, `useScan`, `useGrocery`,
`useCooking`.

**Bugs this fixed along the way:**
- `useTransferGroceryItemsToPantry` (Grocery → "Add Purchased Items to Pantry")
  invalidated only the grocery list. After a transfer, Home / Pantry / recipe
  match % / Ready-to-Cook / Use-Soon all showed stale numbers until a manual
  refresh. Now invalidates the full set.
- `useConfirmScan` (photo-scan confirmation) never invalidated
  `recommendations`, so Use-Soon didn't react to newly scanned stock. Now it
  does (via the shared helper).

Covered by `hooks/__tests__/invalidatePantryDerived.test.ts`.

## 8. N+1 check

No new N+1s. The cooking screen's unit-conversion metadata is deliberately
fetched once for the whole screen (`useConversionMeta`, documented). Recipe
coverage is computed from already-loaded pantry + recipe lists in memory, not
per-recipe queries.

## 9. Accessibility

- Freshness is never color-only: `FRESHNESS_META` pairs every state with text +
  an icon (asserted by a test).
- **Remaining:** `PlannerScreen` renders a `Pressable` (the "⋯" meal menu) inside
  a `ListRow`, which is itself a `Pressable` - a nested touchable. It functions
  (inner press wins) and both have `accessibilityRole` + labels, but it's an RN
  anti-pattern. Fixing it cleanly means giving the shared `ListRow` an
  `onRightPress` prop and rendering the right slot as a sibling, not a child, of
  the main pressable - a shared-component change deferred out of this pass.

## 10. Design-system consistency

Freshness copy centralized (§3). Section headers now use consistent titles.
Shortcut row on Home uses `theme.spacing` / `theme.colors` tokens and
`Ionicons`, matching the rest of the app. No new ad-hoc colors or magic numbers
introduced.

## 11. Sustainability / claims language

Re-audited. Kitchen Impact is **ledger counts only** - number of items used,
cooked, etc. - with no "$ saved", "lb of food rescued", or "kg CO₂" anywhere.
Already compliant; no change needed. The post-cook summary line ("Used chicken ·
Expires tomorrow") is derived from the actual confirmed lot allocations and makes
no savings claim.

## 12. Preferences & onboarding honesty (the headline finding)

**Stored but not yet consumed by any logic:** `dietary`, `allergies`,
`dislikedFoods`, `favoriteCuisines`, `cookingTime`, `cookingConfidence`, and the
priority sliders. **Actually consumed:** `nutritionGoals` and
`weeklyGroceryBudget` only.

Copy that claimed otherwise has been corrected to match reality:

| Screen | Was | Now |
|---|---|---|
| `AllergiesScreen` | "We'll flag recipes that contain these." | "We'll keep these on your profile. SmartPrep doesn't screen recipes for allergens yet, so keep checking ingredients yourself." |
| `FoodPreferencesScreen` | "We'll steer recommendations away from these." | "We'll keep these on file for your profile." |
| `PrioritiesScreen` | "This shapes how we recommend meals." | "Tell us what matters - you can adjust these anytime in your profile." |
| `ProfileScreen` | "Shapes how we recommend meals" / "…to fine-tune your recommendations." | "Saved to your profile - deeper personalization is coming" / "…so they're on file for your profile." |
| `WelcomeScreen` | narrow "tells you what to cook next" | broadened to the real feature set (inventory, use-before-spoil, planning, grocery) |

**Why not wire it instead:** the spec allows wiring "if reasonably small." A real
allergen filter is *not* small and is *safety-critical* - it would need an
allergen taxonomy mapped across the whole recipe catalog, and a partial or
best-effort version (a missed allergen) is worse than none. Dietary/cuisine
filters are lower-stakes but still touch three services (recommendations,
planner, recipe browse) with real test ripple. The honest-copy fix is correct
for this pass; wiring these is the top candidate for the next feature phase.
`docs/LIVE_VALIDATION.md` lists this as a disclosed gap for testers.

## 13. README (`README.md`)

- Intro rewritten to name all four intake methods and the review-before-write
  guarantee.
- Replaced the stale "Phase 4 will implement USDA…" note with real sections for
  **nutrition verification** (`usda-lookup`, `resolveNutrition`, `verified` /
  `candidate` / `estimated` / `unresolved` states), **barcode intake**
  (Open Food Facts + USDA GTIN), and **receipt intake** (AWS Textract
  `AnalyzeExpense`).
- Corrected the "backend-only secrets" list: added the three `AWS_*` secrets and
  `OPENAI_SCAN_MODEL`; noted `THEMEALDB_API_KEY` is still unused.
- Added links to the two new docs.
- Migration count is current (0001-0015).

## 14. New docs

- `docs/SMOKE_TEST.md` - 14-step golden path (account → manual add → photo scan →
  barcode → receipt → Use Soon → Generate My Week → Add Week to Grocery → check
  purchased → transfer to Pantry → complete trip → cook → verify deduction →
  verify Kitchen Impact) + five failure/retry cases. Explicitly *not* to be run
  against a shared project.
- `docs/LIVE_VALIDATION.md` - readiness checklist (DB/migrations/RLS, Edge
  Functions, secrets, auth isolation, device capabilities, cache-freshness spot
  checks). Every row is ☐/◐; the only ☑ is the static grep proof that no secret
  is bundled in the client.

## 15. Secrets check (§32)

Static grep confirms: the only `EXPO_PUBLIC_*` variables in client code are
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (safe to ship -
RLS-protected). `OPENAI`, `AWS_*`, and `USDA_API_KEY` appear **only** under
`supabase/functions/`. No client-visible secret.

## 16. Tests added (§36 - additions only, nothing weakened)

- `utils/__tests__/freshness.test.ts` - the `deriveFreshnessLabel` thresholds,
  the new shared `isPantryItemNeedingAttention` predicate (and that it agrees
  with the urgency sort order), and that `FRESHNESS_META` never conveys state by
  color alone.
- `hooks/__tests__/invalidatePantryDerived.test.ts` - the consolidated
  invalidation helper hits pantry + every derived surface, including the
  most-often-forgotten `recommendations` key.

## 17. Files touched

```
Modified
  README.md
  features/home/screens/HomeScreen.tsx
  features/home/components/ImpactSummaryCard.tsx
  features/pantry/screens/PantryScreen.tsx
  features/scan/screens/ScanModeSelectScreen.tsx
  features/planner/screens/PlannerScreen.tsx
  features/recipes/screens/RecipeDetailScreen.tsx
  features/preparedMeals/screens/PreparedMealsScreen.tsx
  features/profile/screens/ProfileScreen.tsx
  features/onboarding/screens/AllergiesScreen.tsx
  features/onboarding/screens/FoodPreferencesScreen.tsx
  features/onboarding/screens/PrioritiesScreen.tsx
  features/onboarding/screens/WelcomeScreen.tsx
  utils/freshness.ts
  hooks/useGrocery.ts
  hooks/usePantry.ts
  hooks/useBarcode.ts
  hooks/useReceipt.ts
  hooks/useScan.ts
  hooks/useCooking.ts
Added
  hooks/invalidatePantryDerived.ts
  hooks/__tests__/invalidatePantryDerived.test.ts
  utils/__tests__/freshness.test.ts
  docs/SMOKE_TEST.md
  docs/LIVE_VALIDATION.md
  docs/PRODUCT_QUALITY_PASS.md   (this file)
Deleted
  features/home/components/UseFirstSection.tsx
  features/home/components/ScanHeroCard.tsx
```

## 18. Recommended next steps (not done here - out of scope for a quality pass)

1. **Wire preferences into logic** (or keep the honest copy). Priority order:
   dietary + disliked-foods soft filter on recommendations/browse first (lower
   risk), a properly-modeled allergen filter as its own project (safety-critical).
2. **`ListRow` right-slot press** - add `onRightPress` to the shared component so
   Planner (and any future row with a trailing action) stops nesting pressables.
3. **Friendly cooking-error mapping** - a small map from the `complete_cooking_event`
   `raise exception` strings to reassuring copy, keeping the specific numbers.
4. **Run `docs/LIVE_VALIDATION.md`** against a real project before user testing:
   migrations, RLS verification SQL, deploy + secret the three Edge Functions.
5. **Scan image downscaling** (`expo-image-manipulator`) so large captures resize
   instead of hard-rejecting.
6. **History discoverability** - decide whether Scan History / Grocery History
   deserve a surface beyond their header icons.

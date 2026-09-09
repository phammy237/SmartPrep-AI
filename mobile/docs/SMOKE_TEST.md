# Golden-path smoke test

One manual pass that exercises the whole product end to end. Run it on a real
device against a linked Supabase project with the three Edge Functions deployed
(see [LIVE_VALIDATION.md](LIVE_VALIDATION.md)). Expect ~15-20 minutes.

Do **not** run this against a shared/production project - it writes real rows.
Use a throwaway account.

---

## Setup

- Fresh install (or clear app data) so onboarding runs.
- Device has camera access; have a barcoded grocery item and a paper receipt handy.

## Golden path

| # | Step | Do this | Expect |
|---|------|---------|--------|
| 1 | **Create account** | Onboarding → sign up with a new email/password → complete the preference screens | Lands on Home. A `profiles` row exists. Preference screens say prefs are saved to your profile (no promise they steer recommendations; allergies screen says recipes are **not** screened for allergens). |
| 2 | **Add an item manually** | Scan tab (center button) → **Add to Pantry** → **Add Manually** → e.g. "Chicken thighs", 500 g, set a use-by date a few days out → save | Item appears in Pantry. Home shows it under a freshness state consistent with the date. |
| 3 | **Scan ingredients (photo)** | Scan → **Scan Ingredients** → photograph a few items → review screen | Every detection needs explicit confirm; a missing/uncertain quantity or a non-persistable unit blocks confirm. On inference failure you get a retry / manual-entry path, never canned demo items. |
| 4 | **Confirm the scan** | Confirm all → back to Home | New lots in Pantry. Home "needs attention" line, recipe match %, Ready-to-Cook, and Use-Soon all reflect the new stock without a manual refresh. Scan appears in Scan History (no photo stored). |
| 5 | **Scan a barcode** | Scan → **Scan Barcode** → scan a real UPC/EAN (or type it) | Found product prefills the barcode review screen. Confirm name / quantity / unit / dates → lot created. Nutrition shows `verified` (exact USDA GTIN) or `candidate` (Open Food Facts), labeled honestly. |
| 6 | **Scan a receipt** | Scan → **Scan Receipt** → photograph a receipt → review | Parsed line items are editable/deselectable. Confirm → items created independently; a partial failure offers "Retry N" for just the failures. |
| 7 | **Use Soon** | Home → Use Soon section | Ranks recipes by pantry overlap + expiry. Tapping the "N ingredients need attention" line opens Pantry filtered to those items. |
| 8 | **Generate My Week** | Plan tab → **Generate My Week** | Caption explains it favors what you have + ingredients to use soon. A week of planned meals appears. Planned meals do **not** count toward consumed nutrition. |
| 9 | **Add Week to Grocery** | Plan → **Add Week to Grocery List** | Whole-week demand aggregated, pantry subtracted once, shortfalls written as `meal_plan` grocery lines. Running it twice does not double the demand. |
| 10 | **Check items purchased** | Grocery (`/grocery`, also reachable from the Home shortcut) → check off the items you "bought" | Checked = acquired, not yet in pantry. An "Add Purchased Items to Pantry (N)" button appears. |
| 11 | **Transfer to Pantry** | Tap that button → review quantities/units (grocery qty = needed, not bought) → optionally set one purchase date → confirm | One line → one lot. Transferred lines stay checked, show "Added to pantry". Re-running with an already-transferred line returns the same lot (no duplicate). Same invalidation as step 4. |
| 12 | **Complete the shopping trip** | Grocery → **Complete Shopping Trip** (answer the "N purchased items not yet in Pantry" prompt if shown) | Active list is frozen into History, a fresh empty active list is created, pantry is **not** touched by completion. Trip visible at `/grocery/history`. |
| 13 | **Cook a recipe** | Recipes (Home shortcut or "All recipes") → pick one that's ready → **Start Cooking** → review the FEFO deduction proposal (adjust lots if you want) → **Finish** | Finish is hard-blocked until every shortfall row is resolved. Completion is one atomic transaction; a second Finish on the same event is rejected, not re-applied. |
| 14 | **Verify deduction + Kitchen Impact** | Check Pantry, then Profile → Kitchen Impact, then Nutrition | Pantry quantities dropped by exactly the confirmed amounts; matching `deducted_by_cooking` events. Leftover servings show in **Leftovers** (`/prepared-meals`). Kitchen Impact shows ledger counts only - no $/weight/CO₂ claims. If you logged servings eaten, they appear in Nutrition against your goals. |

## Failure / retry cases (do at least these three)

| Case | Trigger | Expect |
|------|---------|--------|
| **Barcode not found** | Scan a barcode with no Open Food Facts entry | Clear "product not found" → routed to manual entry. No fabricated product. |
| **Receipt OCR failure** | Submit a blurry / non-receipt photo | Honest failure message + retry; nothing written to the pantry. |
| **Insufficient pantry during cooking** | Start a cook, then in another session reduce one of the lots below what the cook needs, then Finish | Whole completion rejected with the specific item/quantity gap ("insufficient pantry stock for X (have …, need …)"); nothing partially deducted. |
| **Duplicate submit** | Double-tap Finish / Confirm / Complete Trip / Add Week | Converges to one result - no double-deduction, no forked scan, no doubled grocery demand. |
| **Dropped response on transfer** | Kill the app right after confirming a Grocery→Pantry transfer, relaunch, redo it | Same lot returned; no duplicate item or `added` event. |

## Pass criteria

- Every golden-path row behaves as described with **no manual pull-to-refresh** needed for a downstream screen to be correct.
- No raw Supabase / Postgres / AWS error string is shown to the user (domain messages like the stock-gap line above are fine).
- No screen claims a preference (diet / allergy / cuisine) changed what was recommended or shown.

# Live-validation readiness checklist

Status of everything that can only be proven against a **real** Supabase project +
real devices. Nothing in this list has been executed live in the environment this
was built in (no linked Supabase project, no Docker, no device). This is the
checklist to run before user testing or a TestFlight build - not a claim that any
of it passed.

Legend: ☐ not started · ◐ partially done / code-ready · ☑ verified live (date + who)

---

## 1. Database

| # | Check | How | Status |
|---|-------|-----|--------|
| 1.1 | All 15 migrations apply clean on a fresh project | `npx supabase db push` against a new project ref | ☐ |
| 1.2 | Generated types match the live schema | `npx supabase gen types typescript --linked > types/database.types.ts`, then `npm run typecheck` clean | ◐ (types are a hand-authored stand-in until this is run) |
| 1.3 | RLS is actually enforced on every user table | Run `supabase/tests/rls_verification.sql` in the SQL editor with two throwaway accounts; must end in `ALL RLS CHECKS PASSED` | ☐ |
| 1.4 | Security-definer RPCs reject `auth.uid() = null` and cross-user ids | Covered by 1.3; spot-check `create_pantry_item`, `complete_cooking_event`, `complete_grocery_list`, `transfer_grocery_item_to_pantry` | ☐ |
| 1.5 | Append-only ledgers have no UPDATE/DELETE grant | `pantry_events`, `meal_logs`, `cooking_event_ingredients` - confirm in 1.3 output | ☐ |
| 1.6 | Recipe catalog seed present | `0004` seed produced 16 public `trust_label = 'demo'` recipes | ☐ |
| 1.7 | `nutrition_reference` cache table writable only by the Edge Function role | `0007` / `0013` | ☐ |

## 2. Edge Functions

| # | Check | How | Status |
|---|-------|-----|--------|
| 2.1 | `scan-ingredients` deployed | `npx supabase functions deploy scan-ingredients` | ☐ |
| 2.2 | `usda-lookup` deployed | `npx supabase functions deploy usda-lookup` | ☐ |
| 2.3 | `receipt-ocr` deployed | `npx supabase functions deploy receipt-ocr` | ☐ |
| 2.4 | Each function requires a valid user JWT (401 without) | `curl` the function URL with no `Authorization` header | ☐ |
| 2.5 | Functions return the provider-neutral shape the client validates (Zod) | Real call from a dev build; watch for `ScanInferenceError` / OCR failure copy | ☐ |
| 2.6 | Vision image + receipt image are transient (never written to storage or logs) | Review function logs after a call - no base64, no data URL | ◐ (code is written this way; confirm in live logs) |

## 3. Secrets (Edge Function only - never `EXPO_PUBLIC_`)

| # | Secret | Function | Status |
|---|--------|----------|--------|
| 3.1 | `USDA_API_KEY` | `usda-lookup` | ☐ |
| 3.2 | `OPENAI_API_KEY` (+ optional `OPENAI_SCAN_MODEL`) | `scan-ingredients` | ☐ |
| 3.3 | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | `receipt-ocr` | ☐ |
| 3.4 | IAM user for 3.3 is limited to `textract:AnalyzeExpense` | AWS console | ☐ |
| 3.5 | Client bundle carries no secret | `grep -r EXPO_PUBLIC_ src` shows only `SUPABASE_URL` / `SUPABASE_ANON_KEY`; `OPENAI` / `AWS` / `USDA` appear only under `supabase/functions/` | ☑ verified by static grep (2026-09-08) |

## 4. Auth & isolation

| # | Check | Status |
|---|-------|--------|
| 4.1 | Email/password sign-up creates a `profiles` row | ☐ |
| 4.2 | Sign-in, sign-out, and app-relaunch session restore | ☐ |
| 4.3 | Password reset email link works end-to-end (`app/auth/reset-password.tsx`) | ☐ |
| 4.4 | Two accounts cannot see each other's pantry / recipes / grocery / logs | ☐ (formalized by 1.3) |
| 4.5 | `profiles.timezone` drives expiration + nutrition date boundaries (not device time) | ☐ |

## 5. Device capabilities

| # | Check | Status |
|---|-------|--------|
| 5.1 | Camera permission prompt + denial path (photo scan) | ☐ |
| 5.2 | Barcode scanner reads a real UPC/EAN; typed-entry fallback works | ☐ |
| 5.3 | Receipt capture + Textract round-trip on a real receipt photo | ☐ |
| 5.4 | Large capture is rejected gracefully (over `MAX_SCAN_IMAGE_BASE64_CHARS`) rather than hanging | ☐ |
| 5.5 | Navigation: every tab, the Scan hub, and the non-tab routes (`/grocery`, `/recipes`, `/prepared-meals`, `/scan/history`, `/grocery/history`) reachable and back-stack sane | ◐ (audited statically; confirm on device) |
| 5.6 | Offline / dropped-connection: mutations surface a retry, no silent data loss | ☐ |

## 6. Data-freshness (cache invalidation) spot checks

| # | Flow | Expected | Status |
|---|------|----------|--------|
| 6.1 | Grocery → "Add Purchased Items to Pantry" | Home "needs attention", Pantry, recipe match %, Ready-to-Cook, Use-Soon all update without a manual refresh | ◐ (fixed in `invalidatePantryDerivedQueries`; verify live) |
| 6.2 | Confirm a photo scan | Same surfaces as 6.1, plus Scan History | ◐ (added `recommendations` to `useConfirmScan`; verify live) |
| 6.3 | Complete a cook | Pantry quantities down, Prepared Meals balance up, plan item completed, nutrition log created | ☐ |
| 6.4 | Complete a shopping trip | Active list cleared, trip in History, pantry untouched | ☐ |

---

## Known gaps to disclose to testers

- Dietary preferences, allergies, disliked foods, favorite cuisines, cooking time,
  cooking confidence, and priority sliders are **stored on the profile but do not
  yet influence recommendations, planning, or recipe display.** In particular,
  **SmartPrep does not screen recipes for allergens** - the onboarding and profile
  copy now says so. Consumed today: nutrition goals and weekly grocery budget only.
- No "re-add items from a past scan / past shopping week" action.
- Nutrition is `verified` only for exact USDA matches; everything else is
  `candidate` / `estimated` and labeled as such.

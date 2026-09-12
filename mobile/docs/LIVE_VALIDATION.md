# Live-validation readiness checklist

Status of everything that can only be proven against a **real** Supabase project +
real devices. This is the checklist to run before user testing or a TestFlight
build - not a claim that everything below has passed just because some items now
have.

Legend: ☐ not started · ◐ partially done / code-ready · ☑ verified live (date + who)

---

## 0. Project linked (updated 2026-09-11 - supersedes the original "no project" blocker)

The original blocker recorded here (checked 2026-09-09: no linked project, no
`.env`, only an unrelated job-application-tracker project on the account) is
resolved. A dedicated SmartPrep Supabase project (`knbqyqhnbyotipmxygml`) now
exists, is linked, and has `.env` configured. Migrations `0001`-`0015` are
applied and `supabase/tests/rls_verification.sql` has passed live twice (see
1.1/1.3 below) with explicit User A / User B isolation checks, both direct
table access and RPC access, in both directions - no RLS/grant/schema bug
found. Generated types (`types/database.types.ts`) have been regenerated
against the live schema and the app aligned to them.

---

## 1. Database

| # | Check | How | Status |
|---|-------|-----|--------|
| 1.1 | All 15 migrations apply clean | Applied live to `knbqyqhnbyotipmxygml` | ☑ verified live (2026-09-11) |
| 1.2 | Generated types match the live schema | `npx supabase gen types typescript --linked > types/database.types.ts`, then drift fixed at repository boundaries, `npx tsc --noEmit` clean | ☑ verified live (2026-09-11) |
| 1.3 | RLS is actually enforced on every user table | `supabase/tests/rls_verification.sql` run live twice against `knbqyqhnbyotipmxygml` with two real throwaway accounts; ended in `ALL RLS CHECKS PASSED` both times | ☑ verified live (2026-09-11) |
| 1.4 | Security-definer RPCs reject `auth.uid() = null` and cross-user ids | Covered by 1.3, plus a standalone independent isolation script (direct table + RPC access, both directions) | ☑ verified live (2026-09-11) |
| 1.5 | Append-only ledgers have no UPDATE/DELETE grant | `pantry_events`, `meal_logs`, `cooking_event_ingredients` - confirmed in 1.3 output (several were test-assumption bugs, not real gaps - see session notes) | ☑ verified live (2026-09-11) |
| 1.6 | Recipe catalog seed present | `0004` seed produced 16 public `trust_label = 'demo'` recipes | ☐ |
| 1.7 | `nutrition_reference` cache table writable only by the Edge Function role | `0007` / `0013` | ☐ (schema/grants confirmed via 1.3; no Edge Function has actually written to it live yet - see §2) |

## 2. Edge Functions

**Sequencing note (2026-09-11): ingredient scanning is no longer first in this
list.** SmartPrep is moving to a custom ingredient-recognition model instead of
OpenAI Vision as the production-primary path - see
`docs/INGREDIENT_MODEL_ROADMAP.md`. The validation order is now:

1. `usda-lookup` live validation
2. Barcode nutrition E2E (Open Food Facts + USDA exact-GTIN verification)
3. `receipt-ocr` / Textract validation, if receipt intake is wanted live
4. Custom ingredient model development (separate track - `docs/INGREDIENT_MODEL_ROADMAP.md`)
5. Ingredient scan integration, once custom inference is ready

| # | Check | How | Status |
|---|-------|-----|--------|
| 2.1 | `usda-lookup` deployed | `npx supabase functions deploy usda-lookup` | ☐ |
| 2.2 | `receipt-ocr` deployed | `npx supabase functions deploy receipt-ocr` | ☐ |
| 2.3 | `scan-ingredients` (OpenAI) deployed | **DEFERRED / OPTIONAL BENCHMARK** - not part of the current production-readiness push. Kept implemented (`lib/scan/providers/openAiBenchmarkProvider.ts`) as a future benchmark/fallback only, and only runs at all when `EXPO_PUBLIC_INGREDIENT_INFERENCE_PROVIDER=openai-benchmark` is explicitly set (unset in production - Scan fails closed with `provider_unavailable`, never a silent OpenAI call). Do not report ingredient scanning as production-live on the strength of this function alone. | ☐ deferred |
| 2.4 | Each deployed function requires a valid user JWT (401 without) | `curl` the function URL with no `Authorization` header | ☐ |
| 2.5 | Deployed functions return the provider-neutral shape the client validates (Zod) | Real call from a dev build; watch for `ScanInferenceError` / OCR failure copy | ☐ |
| 2.6 | Any image sent to a provider is transient (never written to storage or logs) | Review function logs after a call - no base64, no data URL | ◐ (code is written this way; confirm in live logs once deployed) |

## 3. Secrets (Edge Function only - never `EXPO_PUBLIC_`)

| # | Secret | Function | Status |
|---|--------|----------|--------|
| 3.1 | `USDA_API_KEY` | `usda-lookup` | ☐ |
| 3.2 | `OPENAI_API_KEY` (+ optional `OPENAI_SCAN_MODEL`) | `scan-ingredients` (deferred/optional benchmark - see §2) | ☐ not needed until §2.3 is actually pursued |
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

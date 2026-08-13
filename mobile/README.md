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
services/            Data-access layer (authService/userService are real; everything else is still mock)
lib/                 Backend-adjacent infra: Supabase client/auth, validation schemas, error mapping
store/               Zustand stores for client-only state (onboarding draft, scan session, hasOnboarded flag)
data/                Mock/seed data consumed by the still-mock services/
types/               Shared TypeScript types, incl. generated database.types.ts
utils/               Pure helper functions (formatting, nutrition math, freshness, dates)
supabase/
  migrations/          committed SQL migrations, applied with `supabase db push`
  tests/               SQL scripts for verifying RLS policies against a live project
```

Screens should stay declarative: data comes from `hooks/`, mutations go through `hooks/`, and one-off pure logic belongs in `utils/`, not inlined in a screen.

### Data layer

**Identity/preferences (`authService.ts`, `userService.ts`) and pantry (`pantryService.ts`) are backed by a real Supabase project** - see [Backend (Supabase)](#backend-supabase) below.

Everything else - recipes, planner, grocery, scan (vision/OCR itself), kitchen impact - is still mock: `services/` reads and writes an in-memory mock database (`services/mockDb.ts`, seeded from `data/`) through `services/apiSimulation.ts`, which adds artificial latency to mimic real network calls. `hooks/` wraps each service in [TanStack Query](https://tanstack.com/query). Swapping in a real backend means reimplementing the service, following the pattern `userService.ts`/`pantryService.ts` now use; the hooks and screens above it shouldn't need to change.

**Scan confirming into the pantry is still mock-only.** `scanService.confirmScan` still writes into the mock `db.pantry` array (unchanged from before Phase 2) - it does not write to the real `pantry_items` table. Scan (vision/OCR) itself is out of scope until a later phase; connecting its confirm step to real persistence is part of that work, not Phase 2. Until then, items added via the Scan flow will not appear in the real pantry list.

### Pantry (Phase 2)

**Quantity invariant:** `pantry_items.quantity` is always the current on-hand amount and can never be negative (DB `check (quantity >= 0)`). Reaching exactly zero always means `status = 'depleted'`; moving back above zero always means `status = 'active'`. Quantity and status can only change through five Postgres RPCs (`create_pantry_item`, `adjust_pantry_quantity`, `deplete_pantry_item`, `restore_pantry_item`, `confirm_pantry_item`) - see `supabase/migrations/0002_pantry.sql` for why these are `security definer` (the one deliberate exception to "prefer security invoker" elsewhere in this codebase) and column-level grants block plain client `.update()` calls from touching those two columns directly. Everything else (name, category, unit, notes, storage location, dates) is a plain RLS-protected client `.update()`, since those edits don't need a matching ledger entry.

**Event ledger:** `pantry_events` is an append-only history of everything that has happened to an item (`added`, `adjusted`, `consumed`, `depleted`, `discarded`, `corrected`, `restored` are actively written by Phase 2; `deducted_by_cooking` is written by the existing `useUseSomeManyPantryItems` hook used from `CookingModeScreen` - kept wired to real data since it's an existing pantry-deduction call site, not new cooking functionality; `donated`/`traded` are reserved, unwritten until the community-exchange phase). No role has an UPDATE or DELETE grant on `pantry_events` at all, not even the owning user - history is immutable by construction, not just by convention.

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
npm start        # expo start
npm run ios      # expo start --ios
npm run android  # expo start --android
npm run web      # expo start --web
npm test         # jest --watchAll
npm run lint     # expo lint
```

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

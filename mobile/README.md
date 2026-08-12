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

**Identity and preferences (`authService.ts`, `userService.ts`) are backed by a real Supabase project** - see [Backend (Supabase)](#backend-supabase) below.

Everything else - pantry, recipes, planner, grocery, scan, kitchen impact - is still mock: `services/` reads and writes an in-memory mock database (`services/mockDb.ts`, seeded from `data/`) through `services/apiSimulation.ts`, which adds artificial latency to mimic real network calls. `hooks/` wraps each service in [TanStack Query](https://tanstack.com/query). Swapping in a real backend means reimplementing the service, following the pattern `userService.ts` now uses; the hooks and screens above it shouldn't need to change.

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

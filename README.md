# Payroll Agent

A weekly timecard management app for employees and admins. Built with Next.js 16, Supabase, and NextAuth v5 (Google OAuth).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Auth | NextAuth v5 — Google OAuth, JWT sessions |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS |
| Testing | Vitest (unit), Playwright (E2E) |
| CI/CD | GitHub Actions → Vercel |

---

## Development Workflow

### The Golden Rule
**Never push directly to `main`.** Always work on a branch and open a PR. CI must pass before merging — that's the only gate to production.

```bash
git checkout -b feat/your-feature
# ... make changes, run tests locally ...
git push origin feat/your-feature
gh pr create --title "feat: description" --body "..."
# CI runs automatically — merge once green
```

### Daily commands

```bash
npm run dev           # start dev server at localhost:3000
npm test              # unit tests (Vitest)
npm run test:watch    # unit tests in watch mode
npm run test:coverage # unit tests + coverage report (must stay ≥90%)
npm run test:e2e      # Playwright E2E tests (starts dev server automatically)
npm run build         # production build check
npm run lint          # ESLint
```

---

## CI/CD Pipeline

```
Push/PR → GitHub Actions (Tests job) → merge to main → DB Migrate job → Vercel deploys
```

- **Tests CI** (`ci.yml`) — runs `npm run test:coverage` then `npx playwright test` on every push/PR
- **DB Migrate** (`db-migrate.yml`) — runs all migration files in `supabase/migrations/` against production on every merge to main
- **Branch protection**: `main` requires the `Tests` check to pass before merge
- **Vercel** auto-deploys `main` on every merge; also creates Preview Deployments for PRs

### Required GitHub Secrets

Add these in **Repo → Settings → Secrets and variables → Actions**:

| Secret | Where to find it |
|---|---|
| `AUTH_SECRET` | Your `.env.local` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API |
| `SUPABASE_DB_URL` | Supabase Dashboard → Project Settings → Database → Connection string → URI |

> **`SUPABASE_DB_URL` format**: `postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres`
> Used only by the `Migrate DB` GitHub Actions job to apply schema migrations.

---

## Project Structure

```
src/
  app/
    dashboard/         # Employee timecard UI (weekly view, prev/next nav)
    api/
      timecard/        # GET + POST /api/timecard?week=YYYY-MM-DD
      timecard/submit  # POST /api/timecard/submit
      admin/timecards  # Admin: list, approve, reject timecards
    api/auth/          # NextAuth handlers
  lib/
    pay-periods.ts     # Core weekly pay period logic
    supabase.ts        # Supabase admin client
  types/index.ts       # Shared TypeScript types
  auth.ts              # NextAuth config (Google provider, JWT callbacks)
  middleware.ts        # Route protection

e2e/                   # Playwright E2E tests
  dashboard.spec.ts    # 11 scenarios: happy path, navigation, read-only, rejection, auto-save
  helpers/
    auth.ts            # JWT cookie helper (bypasses Google OAuth in tests)
    fixtures.ts        # Dynamic test payloads (dates computed from real current date)

src/tests/             # Vitest unit tests (≥90% coverage)
  lib/pay-periods.test.ts
  api/timecard.test.ts
  api/timecard-submit.test.ts

supabase/
  schema.sql           # Full database schema (source of truth for new projects)
  migrations/          # Incremental SQL migration files (apply to existing projects)

.github/
  workflows/ci.yml     # GitHub Actions CI
```

---

## Database Migrations

Schema changes are tracked as numbered SQL files in `supabase/migrations/`. Each file is safe to re-run (uses `IF NOT EXISTS` / `IF EXISTS` guards).

### Applying migrations to a Supabase project

Paste the relevant migration file(s) into the **Supabase SQL Editor** for your project and run them. They are idempotent — running the same file twice is safe.

**Production:**
```
Supabase Dashboard → your project → SQL Editor → paste & run
```

**Local dev** (if using Supabase CLI):
```bash
supabase db push
```

### Writing a new migration

1. Add a file: `supabase/migrations/NNN_short_description.sql`
   - `NNN` is the next sequential number (`002`, `003`, …)
2. Use `IF NOT EXISTS` / `IF EXISTS` / `ADD COLUMN IF NOT EXISTS` so the file is safe to re-run
3. Include a comment at the top with the date, context, and what it changes
4. Update `supabase/schema.sql` to reflect the new full schema state

### Migration history

| # | File | Description |
|---|------|-------------|
| 001 | `001_add_rates_and_multi_entry.sql` | Add `employee_rates` table; add `rate_id` + `entry_order` to `time_entries`; drop one-entry-per-day unique constraint |

---

## Pay Period Model

- Each week is **Sunday → Saturday**
- `pay_periods` table stores one row per week (matched on exact `start_date` + `end_date`)
- `getPayPeriodForWeek(supabase, weekStart)` — finds or creates a pay period for any week
- `getWeekStart(date)` — normalises any date to the preceding Sunday
- `parseWeekParam(str)` — validates a `?week=YYYY-MM-DD` query param

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
AUTH_SECRET=                   # random secret for NextAuth JWT encryption
GOOGLE_CLIENT_ID=              # Google OAuth app
GOOGLE_CLIENT_SECRET=          # Google OAuth app
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=                   # email that gets the "admin" role
```

---

## Testing

### Unit tests (Vitest)
- Route handlers tested by calling them directly as functions
- Supabase mocked with a fluent chain builder (`makeChain`/`makeFrom` in test files)
- Coverage thresholds: **≥90%** on `src/lib/**` and `src/app/api/**`

### E2E tests (Playwright)
- Auth bypassed via crafted NextAuth JWT cookie — no real Google login needed
- All `/api/timecard*` calls intercepted with `page.route()` — no real Supabase needed
- Fixtures compute dates dynamically from the real current date (never hardcoded)
- Run locally: `npm run test:e2e` (auto-starts dev server on port 3000)

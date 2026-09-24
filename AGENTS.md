# Agent Guide — Payroll Agent

This file is the authoritative source of truth for AI agents (GitHub Copilot, Claude, etc.) working in this repository. Read it before making any changes.

---

## What this app does

Weekly timecard management for employees and admins:
- **Employees** clock in/out daily, submit timecards weekly
- **Admins** review, approve, or reject timecards
- Pay periods are per-employee, driven by `users.pay_frequency`; each period is a row in the `pay_periods` table

---

## Critical conventions

### Pay periods are frequency-dependent, per employee
- Each employee has a `users.pay_frequency`: `"weekly"` | `"semi_monthly"` | `"monthly"` (default `"weekly"`)
- Period bounds depend on that frequency:
  - `weekly` — **Sunday–Saturday**, same as before
  - `semi_monthly` — **1st–15th** of the month, or **16th–end-of-month** otherwise
  - `monthly` — **1st–end-of-month**
- `pay_periods` rows carry their own `frequency` column, so a given start/end window can exist once per frequency
- `src/lib/pay-periods.ts` exports:
  - `getWeekStart(date: Date): Date` — normalizes any date to its Sunday (unchanged)
  - `generateWeeklyPeriod(referenceDate: Date): { start_date, end_date }` — Sun–Sat bounds for the week containing `referenceDate` (unchanged)
  - `getSemiMonthlyPeriod(date: Date): { start_date, end_date }` — 1st–15th or 16th–end-of-month bounds for the month containing `date`
  - `getMonthlyPeriod(date: Date): { start_date, end_date }` — 1st–end-of-month bounds for the month containing `date`
  - `getPeriodBoundsForFrequency(frequency: string, referenceDate: Date): { start_date, end_date }` — dispatches to one of the three calculators above by frequency; throws on an unrecognized frequency
  - `getPayPeriodForEmployee(supabase, employee: { pay_frequency: string }, referenceDate: Date): Promise<PayPeriod>` — finds or creates the DB row for that employee's frequency and period, tagging created rows with `frequency` — always use this, never query `pay_periods` directly in route handlers. **Replaces the old `getPayPeriodForWeek(supabase, weekStart)`, which no longer exists.**
  - `parseWeekParam(weekStr: string | null | undefined, frequency: string = "weekly"): Date` — validates a `?week=YYYY-MM-DD` param and normalizes it to the start of the period implied by `frequency` (Sunday for weekly, the 1st/16th for semi_monthly, the 1st for monthly); defaults to today's period when `weekStr` is absent — always call this on incoming week params before using them

### API routes accept a `week` param
- `GET /api/timecard?week=YYYY-MM-DD` — omit for current week (or current period, for a non-weekly employee); response includes `rates` array and a top-level `pay_frequency` field so the dashboard knows which nav mode to render
- `POST /api/timecard` body: `{ week, work_date, clock_in, clock_out, notes, rate_id? }` — always **inserts** a new entry (no date upsert)
- `PATCH /api/timecard/entry/[id]` body: `{ clock_in, clock_out, notes, rate_id }` — update an existing entry
- `DELETE /api/timecard/entry/[id]` — delete a single entry
- `POST /api/timecard/submit` body: `{ week }` — on success, inserts a `notifications` row per admin and fires the `payroll/timecard.submitted` Inngest event (see "Admin: pay frequency, payroll runs, and notifications" below)
- The `week` param name is kept as-is for backward compatibility even though it may denote a semi-monthly or monthly period start for non-weekly employees — always resolve it via `parseWeekParam(weekStr, employee.pay_frequency)`, never assume it's a Sunday

### Employee rates (admin-managed)
- Rates are per-employee named profiles: `POST /api/admin/employees/[id]/rates` with `{ label, hourly_rate, is_default? }`
- `GET /api/admin/employees/[id]/rates` — list rates for an employee
- `DELETE /api/admin/employees/[id]/rates/[rateId]` — remove a rate
- Each time entry has an optional `rate_id` FK to `employee_rates`
- The GET `/api/timecard` response includes a `rates` array for the dropdown

### Multiple entries per day
- `UNIQUE(timecard_id, work_date)` is **removed** — multiple entries per day are allowed
- `entry_order` (int) tracks order within a day for stable display
- `POST /api/timecard` always **inserts** (never upserts by date)
- Use `PATCH /api/timecard/entry/[id]` to update; `DELETE /api/timecard/entry/[id]` to remove

### Dashboard is a client component
- `src/app/dashboard/page.tsx` uses `"use client"` — no server-side data fetching
- Weekly employees: navigation via `weekOffset` state; `weekStartStr` derived via `useMemo` (unchanged)
- Semi-monthly employees (`pay_frequency === "semi_monthly"`): navigation via `periodOffset` state instead — prev/next re-fetches using a date one day outside the currently-loaded `pay_period` bounds (`data.pay_period.start_date - 1` / `end_date + 1`), letting the server (`parseWeekParam` + `getPayPeriodForEmployee`) resolve the adjacent period rather than reimplementing period-boundary math client-side
- The per-day entry table is a shared component, `src/app/dashboard/TimecardEntryTable.tsx`, used by both nav modes — it just renders whatever `days` array it's given (7 for weekly, up to 16 for semi-monthly)
- `isEditable` requires BOTH `timecard.status in [draft, rejected]` AND `pay_period.status === "open"`

### Admin: pay frequency, payroll runs, and notifications
- `PATCH /api/admin/employees/[id]` body `{ pay_frequency: "weekly" | "semi_monthly" | "monthly" }` — admin-only; this is the only way an employee's pay frequency changes (no migration should ever hardcode a specific employee's frequency)
- `GET /api/admin/payroll-runs?date=YYYY-MM-DD` (default: today) — admin-only; computes the semi-monthly run window containing `date` and returns every employee with the timecard(s) overlapping that window, across mixed frequencies (`{ runStart, runEnd, employees: [{ employeeId, name, payFrequency, timecards: [...] }] }`). A monthly employee's timecard is attributed only to the run whose window starts on the same day the monthly period does (the 1st–15th run), not both halves of the month — see the route's own comment before changing the overlap query
- `GET /api/admin/notifications` / `PATCH /api/admin/notifications` (`{ id }` or `{ markAll: true }`) — admin-only, scoped to the caller's own `notifications` rows; backs the notification bell in `src/app/admin/page.tsx`, which polls every 45s
- The Inngest function `notifyAdminOnTimecardSubmitted` (`src/inngest/notifications.ts`) listens for `payroll/timecard.submitted` and emails `ADMIN_EMAIL` via Resend — requires `RESEND_API_KEY` (and optionally `NEXT_PUBLIC_APP_URL`) to be set; see README.md's Environment Variables section

### Supabase client
- Always use `supabaseAdmin` from `src/lib/supabase.ts` in API routes
- `supabaseAdmin` is a Proxy — in tests, `vi.mock("@/lib/supabase")` replaces it with a plain object

### Auth
- `auth()` from `src/auth.ts` — returns session or null
- Session has `user.email`, `user.id`, `user.role` ("employee" | "admin")
- Middleware in `src/middleware.ts` protects all routes except `/` and `/api/auth`

---

## Git / PR workflow

**Always use feature branches and PRs:**

```bash
git checkout -b feat/description    # or fix/, chore/, docs/
# make changes
npm test && npm run build           # verify locally before pushing
git add -A
git commit -m "type: description\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push origin feat/description
gh pr create --title "type: description" --fill
```

**Always include the Co-authored-by trailer in commits.**

`main` is protected: the `Tests` CI check must pass before merging. On merge to main, the `Migrate DB` workflow (`db-migrate.yml`) automatically applies any migration files to production. Vercel auto-deploys on merge to `main`.

---

## Testing rules

### Before every PR
```bash
npm run test:coverage  # must pass with ≥90% coverage
npm run test:e2e       # must pass all 12 Playwright scenarios
npm run build          # must produce zero TypeScript errors
```

### When adding a new API route
1. Add unit tests in `src/tests/api/`
2. Use the `makeChain`/`makeFrom` Supabase mock pattern from existing test files
3. Coverage thresholds are enforced — new code must be tested

### When adding a new UI feature
1. Add a Playwright test in `e2e/dashboard.spec.ts` (or a new spec file)
2. Use `data-testid` attributes for stable selectors — never assert on raw date strings
3. Fixture dates in `e2e/helpers/fixtures.ts` are always computed dynamically from the real current date — never hardcode year/month values

### Supabase mock pattern (Vitest)
```ts
// In test files: use makeChain + makeFrom from the existing test helpers
makeFrom(
  { data: MOCK_USER, error: null },      // first .from() call
  { data: MOCK_TIMECARD, error: null },  // second .from() call
  { data: MOCK_ENTRIES, error: null },   // third .from() call
);
// makeChain makes all methods chainable; .single()/.maybeSingle() return Promise.resolve(value)
// The builder is also directly awaitable (has .then) for chains that end without an explicit terminal
```

### Playwright mock pattern
```ts
// Use route.fallback() NOT route.continue() — fallback cascades to the next handler
await page.route("**/api/timecard**", (route) => {
  if (route.request().method() === "GET" && !route.request().url().includes("/submit")) {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  } else {
    route.fallback(); // ← always fallback, never continue()
  }
});
```

---

## Database Migrations

### Convention
- Schema changes go in `supabase/migrations/YYYYMMDDHHmmss_short_name.sql` (Supabase CLI timestamp format)
- Always use `IF NOT EXISTS` / `IF EXISTS` / `ADD COLUMN IF NOT EXISTS` — every migration file must be safe to re-run
- After adding a migration, also update `supabase/schema.sql` to reflect the new full schema state
- Never alter `supabase/schema.sql` alone — that file is used for new-project setup only, not for applying incremental changes to existing DBs

### How migrations are deployed
The **Supabase GitHub Integration** automatically runs `supabase db push` on every merge to `main`. No manual steps, no extra secrets, no custom workflow file needed.

### Migration history
| File | Description |
|------|-------------|
| `20260609000000_add_rates_and_multi_entry.sql` | Add `employee_rates`; add `rate_id` + `entry_order` to `time_entries`; drop one-entry-per-day unique constraint |
| `20260924005551_add_pay_frequency_and_notifications.sql` | Add `pay_frequency` to `users`; add `frequency` to `pay_periods`; add `notifications` table |

---

## Database schema summary

```sql
pay_periods      id, start_date, end_date, status (open|closed),
                 frequency (weekly|semi_monthly|monthly), created_at
users            id, email, name, image, role (employee|admin), employee_number,
                 pay_frequency (weekly|semi_monthly|monthly), created_at
employee_rates   id, employee_id → users, label, hourly_rate, is_default, created_at
timecards        id, employee_id → users, pay_period_id → pay_periods,
                 status (draft|submitted|approved|rejected|sent_to_payroll),
                 rejection_note, submitted_at, approved_at, created_at
time_entries     id, timecard_id → timecards, work_date, clock_in, clock_out,
                 total_hours, notes, rate_id → employee_rates, entry_order, created_at
                 (no UNIQUE constraint — multiple entries per day allowed)
notifications    id, recipient_user_id → users, type, timecard_id → timecards (on delete cascade),
                 message, read_at, created_at
```

---

## Common gotchas

| Problem | Fix |
|---|---|
| `edit` tool leaves duplicate content | Use `head -N > /tmp/f && mv /tmp/f original` to truncate |
| Playwright strict mode: "resolved to 2 elements" | Use `getByTestId()` or `.first()` / `.last()` instead of `getByText()` |
| `encode()` from `next-auth/jwt` requires `salt` | Pass `salt: "authjs.session-token"` — this is v5 behavior |
| `vitest` picks up Playwright spec files | `include: ["src/tests/**/*.test.ts"]` in `vitest.config.ts` keeps them separate |
| Supabase chain Proxy causes infinite thenable loop | Never use `new Proxy()` for chain mocks — use explicit builder objects with `.then` property |
| CI `npm ci` fails with lock file mismatch | Run `npm install` locally and commit the updated `package-lock.json` |

---

## Next.js version note

This project uses **Next.js 16** (Turbopack). APIs and conventions may differ from training data. Before writing route handlers or middleware, check `node_modules/next/dist/docs/` for the current API surface.

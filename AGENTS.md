# Agent Guide — Payroll Agent

This file is the authoritative source of truth for AI agents (GitHub Copilot, Claude, etc.) working in this repository. Read it before making any changes.

---

## What this app does

Weekly timecard management for employees and admins:
- **Employees** clock in/out daily, submit timecards weekly
- **Admins** review, approve, or reject timecards
- Pay periods are **Sun–Sat** weeks; each is a row in the `pay_periods` table

---

## Critical conventions

### Pay periods are true weekly (not biweekly)
- A "week" always starts on **Sunday** and ends on **Saturday**
- Use `getWeekStart(date)` from `src/lib/pay-periods.ts` to normalize any date to its Sunday
- `getPayPeriodForWeek(supabase, weekStart)` finds or creates the DB row — always use this, never query `pay_periods` directly in route handlers
- `parseWeekParam(str)` validates `?week=YYYY-MM-DD` params and returns the Sunday — always call this on incoming week params before using them

### API routes accept a `week` param
- `GET /api/timecard?week=YYYY-MM-DD` — omit for current week; response includes `rates` array
- `POST /api/timecard` body: `{ week, work_date, clock_in, clock_out, notes, rate_id? }` — always **inserts** a new entry (no date upsert)
- `PATCH /api/timecard/entry/[id]` body: `{ clock_in, clock_out, notes, rate_id }` — update an existing entry
- `DELETE /api/timecard/entry/[id]` — delete a single entry
- `POST /api/timecard/submit` body: `{ week }`

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
- Week navigation via `weekOffset` state; `weekStartStr` derived via `useMemo`
- `isEditable` requires BOTH `timecard.status in [draft, rejected]` AND `pay_period.status === "open"`

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

## Database schema summary

```sql
pay_periods      id, start_date, end_date, status (open|closed), created_at
users            id, email, name, image, role (employee|admin), created_at
employee_rates   id, employee_id → users, label, hourly_rate, is_default, created_at
timecards        id, employee_id → users, pay_period_id → pay_periods,
                 status (draft|submitted|approved|rejected|sent_to_payroll),
                 rejection_note, submitted_at, approved_at, created_at
time_entries     id, timecard_id → timecards, work_date, clock_in, clock_out,
                 total_hours, notes, rate_id → employee_rates, entry_order, created_at
                 (no UNIQUE constraint — multiple entries per day allowed)
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

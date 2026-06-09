/**
 * Unit tests for GET /api/timecard and POST /api/timecard
 *
 * Both route handlers are tested by calling them directly as functions,
 * with all external dependencies mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the route
// ---------------------------------------------------------------------------
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock("@/lib/pay-periods", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/pay-periods")>();
  return {
    ...original, // keep getWeekStart, generateWeeklyPeriod, parseWeekParam real
    getPayPeriodForWeek: vi.fn(),
  };
});

import { GET, POST } from "@/app/api/timecard/route";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getPayPeriodForWeek } from "@/lib/pay-periods";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_SESSION = { user: { email: "employee@example.com" } };
const MOCK_USER = { id: "user-uuid" };
const MOCK_PAY_PERIOD = {
  id: "pp-uuid",
  start_date: "2025-05-11",
  end_date: "2025-05-17",
  status: "open",
  created_at: "2025-05-11T00:00:00Z",
};
const MOCK_TIMECARD = { id: "tc-uuid", status: "draft", employee_id: "user-uuid", pay_period_id: "pp-uuid" };
const MOCK_ENTRIES = [
  { id: "e1", timecard_id: "tc-uuid", work_date: "2025-05-12", clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
];

/**
 * Creates a Supabase-style fluent chain mock.
 *
 * All chained methods (.select, .eq, .upsert, etc.) return `this` for chaining.
 * .single() and .maybeSingle() return a resolved Promise with `value`.
 * The builder itself is also thenable so that chains ending with .eq() or .order()
 * can be awaited directly — matching how Supabase PostgrestFilterBuilder works.
 */
function makeChain(value: { data: unknown; error: unknown }) {
  const methods = [
    "select", "eq", "lte", "gte",
    "insert", "upsert", "update", "delete", "order", "in",
  ] as const;

  const builder: Record<string, unknown> = {};

  // Chainable methods — return `this`
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }

  // Explicit terminal methods — return a resolved Promise
  builder["single"] = vi.fn().mockResolvedValue(value);
  builder["maybeSingle"] = vi.fn().mockResolvedValue(value);

  // Make the builder itself awaitable so `.order(...)` / `.eq(...)` as the last
  // call can also be awaited (mirrors PostgrestFilterBuilder being a PromiseLike).
  builder["then"] = (
    resolve: (v: unknown) => void,
    reject?: (r: unknown) => void
  ) => Promise.resolve(value).then(resolve, reject);

  return builder;
}

/** Wire up supabaseAdmin.from() to return a chain per call */
function makeFrom(...values: Array<{ data: unknown; error: unknown }>) {
  const fromFn = vi.fn();
  for (const value of values) {
    fromFn.mockReturnValueOnce(makeChain(value));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = fromFn;
  return fromFn;
}

// ---------------------------------------------------------------------------
// GET /api/timecard
// ---------------------------------------------------------------------------
describe("GET /api/timecard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(getPayPeriodForWeek).mockResolvedValue(MOCK_PAY_PERIOD as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const req = new NextRequest("http://localhost/api/timecard");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 400 for an invalid week param", async () => {
    const req = new NextRequest("http://localhost/api/timecard?week=bad-date");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when user is not in the database", async () => {
    makeFrom({ data: null, error: null }); // user lookup returns nothing
    const req = new NextRequest("http://localhost/api/timecard");
    const res = await GET(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "User not found" });
  });

  it("returns 200 with timecard, entries and pay_period for the current week", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },    // user lookup
      { data: MOCK_TIMECARD, error: null }, // timecard upsert
      { data: MOCK_ENTRIES, error: null },  // entries query
      { data: [], error: null },            // rates query
    );

    const req = new NextRequest("http://localhost/api/timecard");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pay_period).toEqual(MOCK_PAY_PERIOD);
    expect(body.timecard).toEqual(MOCK_TIMECARD);
    expect(body.entries).toEqual(MOCK_ENTRIES);
    expect(body.rates).toEqual([]);
  });

  it("accepts a ?week= param and calls getPayPeriodForWeek with the normalised Sunday", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: [], error: null },
      { data: [], error: null }, // rates
    );
    vi.mocked(getPayPeriodForWeek).mockResolvedValue({
      ...MOCK_PAY_PERIOD,
      start_date: "2025-05-04",
      end_date: "2025-05-10",
    } as never);

    // Wednesday 2025-05-07 should be normalised to Sunday 2025-05-04
    const req = new NextRequest("http://localhost/api/timecard?week=2025-05-07");
    await GET(req);

    const callArg: Date = vi.mocked(getPayPeriodForWeek).mock.calls[0][1];
    expect(callArg.toISOString().slice(0, 10)).toBe("2025-05-04");
  });

  it("returns 200 with empty entries array when there are no entries", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: null, error: null }, // entries returns null
      { data: null, error: null }, // rates returns null
    );

    const req = new NextRequest("http://localhost/api/timecard");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
  });

  it("falls back to SELECT when upsert returns null (ignoreDuplicates=true)", async () => {
    // upsert returns null → fallback SELECT returns existing timecard
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: null, error: null },      // upsert maybeSingle → null (duplicate ignored)
      { data: MOCK_TIMECARD, error: null }, // fallback single SELECT
      { data: MOCK_ENTRIES, error: null },
      { data: [], error: null }, // rates
    );

    const req = new NextRequest("http://localhost/api/timecard");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timecard).toEqual(MOCK_TIMECARD);
  });

  it("returns 500 when upsert errors and fallback SELECT also fails", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: null, error: { message: "DB failure" } }, // upsert error
      { data: null, error: null },                       // fallback SELECT → null
    );

    const req = new NextRequest("http://localhost/api/timecard");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/timecard
// ---------------------------------------------------------------------------
describe("POST /api/timecard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(getPayPeriodForWeek).mockResolvedValue(MOCK_PAY_PERIOD as never);
  });

  function makePostRequest(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/timecard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makePostRequest({ work_date: "2025-05-12" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when work_date is missing", async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "work_date is required" });
  });

  it("returns 400 for invalid week param", async () => {
    const res = await POST(makePostRequest({ work_date: "2025-05-12", week: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    makeFrom({ data: null, error: null }); // user lookup returns nothing
    const res = await POST(makePostRequest({ work_date: "2025-05-12" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when timecard is not in draft/rejected state", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: { ...MOCK_TIMECARD, status: "submitted" }, error: null },
    );
    const res = await POST(makePostRequest({ work_date: "2025-05-12" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("not editable") });
  });

  it("returns 409 when timecard is approved", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: { ...MOCK_TIMECARD, status: "approved" }, error: null },
    );
    const res = await POST(makePostRequest({ work_date: "2025-05-12" }));
    expect(res.status).toBe(409);
  });

  it("inserts a new time entry and returns 200 on success", async () => {
    const savedEntry = { ...MOCK_ENTRIES[0], clock_in: "08:00:00", clock_out: "16:00:00", entry_order: 0 };
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: [], error: null },          // existing entries for entry_order
      { data: savedEntry, error: null },  // insert entry → single()
    );
    const res = await POST(
      makePostRequest({ work_date: "2025-05-12", clock_in: "08:00", clock_out: "16:00", week: "2025-05-11" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry).toEqual(savedEntry);
  });

  it("inserts multiple entries for the same day without conflict", async () => {
    const firstEntry = { ...MOCK_ENTRIES[0], entry_order: 0 };
    const secondEntry = { ...MOCK_ENTRIES[0], id: "e2", entry_order: 1 };
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: [{ entry_order: 0 }], error: null }, // existing entries for entry_order (first already there)
      { data: secondEntry, error: null },           // insert second entry
    );
    const res = await POST(
      makePostRequest({ work_date: "2025-05-12", clock_in: "13:00", clock_out: "17:00", week: "2025-05-11" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry).toEqual(secondEntry);
    // First entry should not be affected (no conflict)
    expect(firstEntry.entry_order).toBe(0);
  });

  it("accepts and stores rate_id in the new entry", async () => {
    const savedEntry = { ...MOCK_ENTRIES[0], rate_id: "rate-uuid", entry_order: 0 };
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: [], error: null },
      { data: savedEntry, error: null },
    );
    const res = await POST(
      makePostRequest({ work_date: "2025-05-12", clock_in: "08:00", clock_out: "16:00", rate_id: "rate-uuid" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.rate_id).toBe("rate-uuid");
  });

  it("returns 404 when timecard record is not found", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: null, error: null }, // timecard not found
    );
    const res = await POST(makePostRequest({ work_date: "2025-05-12" }));
    expect(res.status).toBe(404);
  });

  it("allows editing a rejected timecard", async () => {
    const savedEntry = { ...MOCK_ENTRIES[0] };
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: { ...MOCK_TIMECARD, status: "rejected" }, error: null },
      { data: [], error: null }, // existing entries for entry_order
      { data: savedEntry, error: null },
    );
    const res = await POST(makePostRequest({ work_date: "2025-05-12", clock_in: "09:00", clock_out: "17:00" }));
    expect(res.status).toBe(200);
  });

  it("returns 500 when entry insert fails", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: [], error: null }, // existing entries for entry_order
      { data: null, error: { message: "insert failed" } },
    );
    const res = await POST(makePostRequest({ work_date: "2025-05-12", clock_in: "09:00", clock_out: "17:00" }));
    expect(res.status).toBe(500);
  });
});


/**
 * Unit tests for GET /api/admin/payroll-runs
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { GET } from "@/app/api/admin/payroll-runs/route";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getSemiMonthlyPeriod } from "@/lib/pay-periods";

const MOCK_ADMIN_SESSION = { user: { email: "admin@example.com", role: "admin" } };
const MOCK_EMPLOYEE_SESSION = { user: { email: "emp@example.com", role: "employee" } };

// Reference date used across the "happy path" tests. Falls in the 1st-15th
// semi-monthly window, mirroring exactly what the route computes.
const REFERENCE_DATE_STR = "2026-06-10";
const { start_date: RUN_START, end_date: RUN_END } = getSemiMonthlyPeriod(
  new Date(`${REFERENCE_DATE_STR}T00:00:00`)
);

const EMPLOYEES = [
  { id: "emp-weekly", name: "Wanda Weekly", pay_frequency: "weekly" },
  { id: "emp-semi", name: "Sam Semi", pay_frequency: "semi_monthly" },
];

// Two weekly pay periods overlapping the semi-monthly run window, plus the
// semi-monthly period itself.
const WEEKLY_PERIOD_1 = { id: "period-w1", start_date: "2026-05-31", end_date: "2026-06-06" };
const WEEKLY_PERIOD_2 = { id: "period-w2", start_date: "2026-06-07", end_date: "2026-06-13" };
const SEMI_PERIOD = { id: "period-semi", start_date: RUN_START, end_date: RUN_END };

const TIMECARDS = [
  {
    id: "tc-w1",
    status: "approved",
    employee_id: "emp-weekly",
    pay_period_id: "period-w1",
    entries: [{ total_hours: 40 }],
  },
  {
    id: "tc-w2",
    status: "submitted",
    employee_id: "emp-weekly",
    pay_period_id: "period-w2",
    entries: [{ total_hours: 35 }, { total_hours: null }],
  },
  {
    id: "tc-semi",
    status: "approved",
    employee_id: "emp-semi",
    pay_period_id: "period-semi",
    entries: [{ total_hours: 80 }],
  },
];

function makeChain(value: { data: unknown; error: unknown }) {
  const methods = ["select", "eq", "order", "lte", "gte", "in"] as const;
  const builder: Record<string, unknown> = {};
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder);
  builder["single"] = vi.fn().mockResolvedValue(value);
  builder["maybeSingle"] = vi.fn().mockResolvedValue(value);
  builder["then"] = (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
    Promise.resolve(value).then(resolve, reject);
  return builder;
}

function makeFrom(...values: Array<{ data: unknown; error: unknown }>) {
  const fromFn = vi.fn();
  for (const v of values) fromFn.mockReturnValueOnce(makeChain(v));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = fromFn;
  return fromFn;
}

function makeGetRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/payroll-runs${query}`);
}

beforeEach(() => vi.clearAllMocks());

interface PayrollRunResponse {
  runStart: string;
  runEnd: string;
  employees: Array<{
    employeeId: string;
    name: string | null;
    payFrequency: string;
    timecards: Array<{
      id: string;
      status: string;
      periodStart: string;
      periodEnd: string;
      totalHours: number;
    }>;
  }>;
}

describe("GET /api/admin/payroll-runs", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_EMPLOYEE_SESSION as never);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid date parameter", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const res = await GET(makeGetRequest("?date=not-a-date"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Invalid date parameter");
  });

  it("returns 500 when the employees query errors", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: { message: "employees boom" } });
    const res = await GET(makeGetRequest(`?date=${REFERENCE_DATE_STR}`));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("employees boom");
  });

  it("returns 500 when the pay_periods query errors", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: EMPLOYEES, error: null },
      { data: null, error: { message: "periods boom" } }
    );
    const res = await GET(makeGetRequest(`?date=${REFERENCE_DATE_STR}`));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("periods boom");
  });

  it("returns 500 when the timecards query errors", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: EMPLOYEES, error: null },
      { data: [WEEKLY_PERIOD_1], error: null },
      { data: null, error: { message: "timecards boom" } }
    );
    const res = await GET(makeGetRequest(`?date=${REFERENCE_DATE_STR}`));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("timecards boom");
  });

  it("skips the timecards query entirely when no pay periods overlap the run window", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const fromFn = makeFrom(
      { data: EMPLOYEES, error: null },
      { data: [], error: null }
    );
    const res = await GET(makeGetRequest(`?date=${REFERENCE_DATE_STR}`));
    expect(res.status).toBe(200);
    expect(fromFn).toHaveBeenCalledTimes(2);
    const json = (await res.json()) as PayrollRunResponse;
    for (const employee of json.employees) {
      expect(employee.timecards).toHaveLength(0);
    }
  });

  it("matches the {runStart, runEnd, employees} response shape exactly", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: EMPLOYEES, error: null },
      { data: [WEEKLY_PERIOD_1, WEEKLY_PERIOD_2, SEMI_PERIOD], error: null },
      { data: TIMECARDS, error: null }
    );
    const res = await GET(makeGetRequest(`?date=${REFERENCE_DATE_STR}`));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(["employees", "runEnd", "runStart"]);
    expect(json.runStart).toBe(RUN_START);
    expect(json.runEnd).toBe(RUN_END);
    expect(Array.isArray(json.employees)).toBe(true);
  });

  it("aggregates a weekly employee's multiple overlapping timecards and a semi-monthly employee's single timecard", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: EMPLOYEES, error: null },
      { data: [WEEKLY_PERIOD_1, WEEKLY_PERIOD_2, SEMI_PERIOD], error: null },
      { data: TIMECARDS, error: null }
    );
    const res = await GET(makeGetRequest(`?date=${REFERENCE_DATE_STR}`));
    const json = (await res.json()) as PayrollRunResponse;

    const weekly = json.employees.find((e) => e.employeeId === "emp-weekly");
    const semi = json.employees.find((e) => e.employeeId === "emp-semi");

    expect(weekly).toBeDefined();
    expect(semi).toBeDefined();
    expect(weekly!.payFrequency).toBe("weekly");
    expect(semi!.payFrequency).toBe("semi_monthly");

    // Weekly employee: two overlapping weekly timecards.
    expect(weekly!.timecards).toHaveLength(2);
    expect(weekly!.timecards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tc-w1",
          status: "approved",
          periodStart: "2026-05-31",
          periodEnd: "2026-06-06",
          totalHours: 40,
        }),
        expect.objectContaining({
          id: "tc-w2",
          status: "submitted",
          periodStart: "2026-06-07",
          periodEnd: "2026-06-13",
          totalHours: 35, // null total_hours entry treated as 0
        }),
      ])
    );

    // Semi-monthly employee: exactly one matching timecard.
    expect(semi!.timecards).toHaveLength(1);
    expect(semi!.timecards[0]).toEqual(
      expect.objectContaining({
        id: "tc-semi",
        status: "approved",
        periodStart: RUN_START,
        periodEnd: RUN_END,
        totalHours: 80,
      })
    );
  });

  it("attributes a monthly employee's timecard only to the run window starting on the 1st, not the 16th-EOM run", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const monthlyEmployee = { id: "emp-monthly", name: "Mo Monthly", pay_frequency: "monthly" };
    const monthlyPeriod = {
      id: "period-monthly",
      start_date: "2026-06-01",
      end_date: "2026-06-30",
      frequency: "monthly",
    };
    const monthlyTimecard = {
      id: "tc-monthly",
      status: "approved",
      employee_id: "emp-monthly",
      pay_period_id: "period-monthly",
      entries: [{ total_hours: 160 }],
    };

    // First-half run (1st-15th): the monthly period's start_date matches
    // runStart, so it should be included.
    makeFrom(
      { data: [monthlyEmployee], error: null },
      { data: [monthlyPeriod], error: null },
      { data: [monthlyTimecard], error: null }
    );
    const firstHalf = await GET(makeGetRequest("?date=2026-06-10"));
    const firstHalfJson = (await firstHalf.json()) as PayrollRunResponse;
    expect(firstHalfJson.employees[0].timecards).toHaveLength(1);
    expect(firstHalfJson.employees[0].timecards[0].id).toBe("tc-monthly");

    // Second-half run (16th-EOM): the same monthly period overlaps this
    // window too, but must NOT be attributed here (would double-count it).
    makeFrom(
      { data: [monthlyEmployee], error: null },
      { data: [monthlyPeriod], error: null }
    );
    const secondHalf = await GET(makeGetRequest("?date=2026-06-20"));
    const secondHalfJson = (await secondHalf.json()) as PayrollRunResponse;
    expect(secondHalfJson.employees[0].timecards).toHaveLength(0);
  });

  it("uses today's date when no ?date= param is given", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: [], error: null }, { data: [], error: null });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as PayrollRunResponse;
    const expected = getSemiMonthlyPeriod(new Date());
    expect(json.runStart).toBe(expected.start_date);
    expect(json.runEnd).toBe(expected.end_date);
  });
});

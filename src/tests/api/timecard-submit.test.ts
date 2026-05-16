/**
 * Unit tests for POST /api/timecard/submit
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/pay-periods", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/pay-periods")>();
  return { ...original, getPayPeriodForWeek: vi.fn() };
});

import { POST } from "@/app/api/timecard/submit/route";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getPayPeriodForWeek } from "@/lib/pay-periods";

const MOCK_SESSION = { user: { email: "employee@example.com" } };
const MOCK_USER = { id: "user-uuid" };
const MOCK_PAY_PERIOD = { id: "pp-uuid", start_date: "2025-05-11", end_date: "2025-05-17", status: "open", created_at: "" };
const MOCK_TIMECARD = { id: "tc-uuid", status: "draft" };

function makeChain(value: { data: unknown; error: unknown }) {
  const methods = ["select", "eq", "lte", "gte", "insert", "upsert", "update", "order"] as const;
  const builder: Record<string, unknown> = {};
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder);
  builder["single"] = vi.fn().mockResolvedValue(value);
  builder["maybySingle"] = vi.fn().mockResolvedValue(value);
  builder["maybeSingle"] = vi.fn().mockResolvedValue(value);
  builder["then"] = (
    resolve: (v: unknown) => void,
    reject?: (r: unknown) => void
  ) => Promise.resolve(value).then(resolve, reject);
  return builder;
}

function makeFrom(...values: Array<{ data: unknown; error: unknown }>) {
  const fromFn = vi.fn();
  for (const v of values) fromFn.mockReturnValueOnce(makeChain(v));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = fromFn;
  return fromFn;
}

function makeSubmitRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/timecard/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const COMPLETE_ENTRIES = [
  { id: "e1", work_date: "2025-05-12", clock_in: "09:00:00", clock_out: "17:00:00" },
  { id: "e2", work_date: "2025-05-13", clock_in: "09:00:00", clock_out: "17:00:00" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(MOCK_SESSION as never);
  vi.mocked(getPayPeriodForWeek).mockResolvedValue(MOCK_PAY_PERIOD as never);
});

describe("POST /api/timecard/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makeSubmitRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid week param", async () => {
    const res = await POST(makeSubmitRequest({ week: "garbage" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    makeFrom({ data: null, error: null }); // user lookup returns nothing
    const res = await POST(makeSubmitRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 when timecard not found", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: null, error: null }, // timecard not found
    );
    const res = await POST(makeSubmitRequest({ week: "2025-05-11" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when timecard is already submitted", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: { ...MOCK_TIMECARD, status: "submitted" }, error: null },
    );
    const res = await POST(makeSubmitRequest());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("cannot be submitted") });
  });

  it("returns 409 when timecard is already approved", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: { ...MOCK_TIMECARD, status: "approved" }, error: null },
    );
    const res = await POST(makeSubmitRequest());
    expect(res.status).toBe(409);
  });

  it("returns 422 when there are no time entries", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: [], error: null }, // entries
    );
    const res = await POST(makeSubmitRequest());
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("at least one") });
  });

  it("returns 422 when any entry is missing clock_out", async () => {
    const incomplete = [
      { id: "e1", work_date: "2025-05-12", clock_in: "09:00:00", clock_out: null },
    ];
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: incomplete, error: null },
    );
    const res = await POST(makeSubmitRequest());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({
      error: expect.stringContaining("clock-in and clock-out"),
      incomplete_dates: ["2025-05-12"],
    });
  });

  it("submits successfully and returns { success: true }", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: COMPLETE_ENTRIES, error: null }, // entries fetch
      { data: null, error: null },              // update call
    );
    const res = await POST(makeSubmitRequest({ week: "2025-05-11" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("allows re-submission of a rejected timecard", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: { ...MOCK_TIMECARD, status: "rejected" }, error: null },
      { data: COMPLETE_ENTRIES, error: null },
      { data: null, error: null },
    );
    const res = await POST(makeSubmitRequest());
    expect(res.status).toBe(200);
  });

  it("defaults to current week when no week param provided in body", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: COMPLETE_ENTRIES, error: null },
      { data: null, error: null },
    );
    // No body at all — route should default to current week
    const req = new NextRequest("http://localhost/api/timecard/submit", { method: "POST" });
    const res = await POST(req);

    expect(getPayPeriodForWeek).toHaveBeenCalled();
    const callArg: Date = vi.mocked(getPayPeriodForWeek).mock.calls[0][1];
    expect(callArg.getDay()).toBe(0); // Sunday
    expect(res.status).toBe(200);
  });
});


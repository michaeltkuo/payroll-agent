/**
 * Unit tests for POST /api/timecard/submit
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/pay-periods", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/pay-periods")>();
  return { ...original, getPayPeriodForEmployee: vi.fn() };
});
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { POST } from "@/app/api/timecard/submit/route";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getPayPeriodForEmployee } from "@/lib/pay-periods";
import { inngest } from "@/inngest/client";

const MOCK_SESSION = { user: { email: "employee@example.com" } };
const MOCK_USER = { id: "user-uuid", name: "Employee Example", email: "employee@example.com", pay_frequency: "weekly" };
const MOCK_PAY_PERIOD = { id: "pp-uuid", start_date: "2025-05-11", end_date: "2025-05-17", status: "open", frequency: "weekly", created_at: "" };
const MOCK_TIMECARD = { id: "tc-uuid", status: "draft" };
const MOCK_ADMINS = [{ id: "admin-1" }, { id: "admin-2" }];

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
  vi.mocked(getPayPeriodForEmployee).mockResolvedValue(MOCK_PAY_PERIOD as never);
});

describe("POST /api/timecard/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makeSubmitRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid week param", async () => {
    makeFrom({ data: MOCK_USER, error: null }); // user lookup happens before week validation
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

  it("returns 500 when the timecard status update fails", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: COMPLETE_ENTRIES, error: null },
      { data: null, error: { message: "update failed" } }, // update call errors
    );
    const res = await POST(makeSubmitRequest({ week: "2025-05-11" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "update failed" });
  });

  it("submits successfully and returns { success: true }", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: COMPLETE_ENTRIES, error: null }, // entries fetch
      { data: null, error: null },              // update call
      { data: MOCK_ADMINS, error: null },       // admins fetch
      { data: null, error: null },              // notifications insert
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
      { data: MOCK_ADMINS, error: null },
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
      { data: MOCK_ADMINS, error: null },
      { data: null, error: null },
    );
    // No body at all — route should default to current week
    const req = new NextRequest("http://localhost/api/timecard/submit", { method: "POST" });
    const res = await POST(req);

    expect(getPayPeriodForEmployee).toHaveBeenCalled();
    const callArg: Date = vi.mocked(getPayPeriodForEmployee).mock.calls[0][2];
    expect(callArg.getDay()).toBe(0); // Sunday
    expect(res.status).toBe(200);
  });

  it("inserts a notification row per admin and fires the payroll/timecard.submitted Inngest event on successful submit", async () => {
    const fromFn = makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: COMPLETE_ENTRIES, error: null }, // entries fetch
      { data: null, error: null },              // update call
      { data: MOCK_ADMINS, error: null },       // admins fetch
      { data: null, error: null },              // notifications insert
    );

    const res = await POST(makeSubmitRequest({ week: "2025-05-11" }));
    expect(res.status).toBe(200);

    // 5th from() call is the admins lookup, 6th is the notifications insert
    expect(fromFn.mock.calls[4][0]).toBe("users");
    expect(fromFn.mock.calls[5][0]).toBe("notifications");

    const notificationsBuilder = fromFn.mock.results[5].value as { insert: ReturnType<typeof vi.fn> };
    expect(notificationsBuilder.insert).toHaveBeenCalledWith(
      MOCK_ADMINS.map((admin) => ({
        recipient_user_id: admin.id,
        type: "timecard_submitted",
        timecard_id: MOCK_TIMECARD.id,
        message: expect.stringContaining(MOCK_USER.name),
      }))
    );

    expect(inngest.send).toHaveBeenCalledWith({
      name: "payroll/timecard.submitted",
      data: {
        timecardId: MOCK_TIMECARD.id,
        employeeId: MOCK_USER.id,
        employeeName: MOCK_USER.name,
        periodStart: MOCK_PAY_PERIOD.start_date,
        periodEnd: MOCK_PAY_PERIOD.end_date,
      },
    });
  });

  it("skips the notifications insert (but still submits and fires the event) when there are no admins", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: COMPLETE_ENTRIES, error: null },
      { data: null, error: null },
      { data: [], error: null }, // no admins
    );

    const res = await POST(makeSubmitRequest({ week: "2025-05-11" }));
    expect(res.status).toBe(200);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "payroll/timecard.submitted" })
    );
  });

  it("still submits and fires the event when the notifications insert errors", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: COMPLETE_ENTRIES, error: null },
      { data: null, error: null },
      { data: MOCK_ADMINS, error: null },
      { data: null, error: { message: "notifications insert failed" } },
    );

    const res = await POST(makeSubmitRequest({ week: "2025-05-11" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "payroll/timecard.submitted" })
    );
  });

  it("still submits and fires the event when the admins lookup errors", async () => {
    makeFrom(
      { data: MOCK_USER, error: null },
      { data: MOCK_TIMECARD, error: null },
      { data: COMPLETE_ENTRIES, error: null },
      { data: null, error: null },
      { data: null, error: { message: "admins lookup failed" } },
    );

    const res = await POST(makeSubmitRequest({ week: "2025-05-11" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "payroll/timecard.submitted" })
    );
  });
});


/**
 * Unit tests for PATCH /api/timecard/entry/[id] and DELETE /api/timecard/entry/[id]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { PATCH, DELETE } from "@/app/api/timecard/entry/[id]/route";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

const MOCK_SESSION = { user: { email: "employee@example.com" } };
const MOCK_USER = { id: "user-uuid" };
const MOCK_ENTRY_WITH_TC = {
  id: "entry-1",
  timecard_id: "tc-uuid",
  timecard: { employee_id: "user-uuid", status: "draft" },
};
const MOCK_UPDATED_ENTRY = {
  id: "entry-1",
  timecard_id: "tc-uuid",
  work_date: "2025-05-12",
  clock_in: "09:00:00",
  clock_out: "17:00:00",
  total_hours: 8,
  notes: null,
  rate_id: null,
  rate: null,
  entry_order: 0,
  created_at: "",
};

function makeChain(value: { data: unknown; error: unknown }) {
  const methods = [
    "select", "eq", "lte", "gte",
    "insert", "upsert", "update", "delete", "order", "in",
  ] as const;
  const builder: Record<string, unknown> = {};
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder);
  builder["single"] = vi.fn().mockResolvedValue(value);
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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePatchRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/timecard/entry/entry-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/timecard/entry/[id]
// ---------------------------------------------------------------------------
describe("PATCH /api/timecard/entry/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(MOCK_SESSION as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await PATCH(makePatchRequest(), makeParams("entry-1") as never);
    expect(res.status).toBe(401);
  });

  it("returns 404 when entry not found", async () => {
    makeFrom({ data: null, error: null }); // entry lookup returns null
    const res = await PATCH(makePatchRequest({ clock_in: "09:00" }), makeParams("entry-1") as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Entry not found" });
  });

  it("returns 403 when entry belongs to a different user", async () => {
    makeFrom(
      { data: { ...MOCK_ENTRY_WITH_TC, timecard: { employee_id: "other-user-id", status: "draft" } }, error: null },
      { data: MOCK_USER, error: null }, // user lookup
    );
    const res = await PATCH(makePatchRequest({ clock_in: "09:00" }), makeParams("entry-1") as never);
    expect(res.status).toBe(403);
  });

  it("returns 409 when timecard is not in draft/rejected state", async () => {
    makeFrom(
      { data: { ...MOCK_ENTRY_WITH_TC, timecard: { employee_id: "user-uuid", status: "submitted" } }, error: null },
      { data: MOCK_USER, error: null },
    );
    const res = await PATCH(makePatchRequest({ clock_in: "09:00" }), makeParams("entry-1") as never);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("not editable") });
  });

  it("returns 200 and updates the entry", async () => {
    makeFrom(
      { data: MOCK_ENTRY_WITH_TC, error: null },  // entry with timecard
      { data: MOCK_USER, error: null },            // user lookup
      { data: MOCK_UPDATED_ENTRY, error: null },  // update result
    );
    const res = await PATCH(
      makePatchRequest({ clock_in: "09:00", clock_out: "17:00" }),
      makeParams("entry-1") as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry).toEqual(MOCK_UPDATED_ENTRY);
  });

  it("returns 200 for rejected timecard (editable)", async () => {
    makeFrom(
      { data: { ...MOCK_ENTRY_WITH_TC, timecard: { employee_id: "user-uuid", status: "rejected" } }, error: null },
      { data: MOCK_USER, error: null },
      { data: MOCK_UPDATED_ENTRY, error: null },
    );
    const res = await PATCH(makePatchRequest({ clock_in: "09:00" }), makeParams("entry-1") as never);
    expect(res.status).toBe(200);
  });

  it("returns 500 on update DB error", async () => {
    makeFrom(
      { data: MOCK_ENTRY_WITH_TC, error: null },
      { data: MOCK_USER, error: null },
      { data: null, error: { message: "update failed" } },
    );
    const res = await PATCH(makePatchRequest({ clock_in: "09:00" }), makeParams("entry-1") as never);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/timecard/entry/[id]
// ---------------------------------------------------------------------------
describe("DELETE /api/timecard/entry/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(MOCK_SESSION as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("entry-1") as never);
    expect(res.status).toBe(401);
  });

  it("returns 404 when entry not found", async () => {
    makeFrom({ data: null, error: null });
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("entry-1") as never);
    expect(res.status).toBe(404);
  });

  it("returns 403 when entry belongs to a different user", async () => {
    makeFrom(
      { data: { id: "entry-1", timecard: { employee_id: "other-user-id", status: "draft" } }, error: null },
      { data: MOCK_USER, error: null },
    );
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("entry-1") as never);
    expect(res.status).toBe(403);
  });

  it("returns 409 when timecard is submitted", async () => {
    makeFrom(
      { data: { id: "entry-1", timecard: { employee_id: "user-uuid", status: "submitted" } }, error: null },
      { data: MOCK_USER, error: null },
    );
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("entry-1") as never);
    expect(res.status).toBe(409);
  });

  it("returns 200 on successful delete", async () => {
    makeFrom(
      { data: { id: "entry-1", timecard: { employee_id: "user-uuid", status: "draft" } }, error: null },
      { data: MOCK_USER, error: null },
      { data: null, error: null }, // delete
    );
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("entry-1") as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("returns 500 on delete DB error", async () => {
    makeFrom(
      { data: { id: "entry-1", timecard: { employee_id: "user-uuid", status: "draft" } }, error: null },
      { data: MOCK_USER, error: null },
      { data: null, error: { message: "delete failed" } },
    );
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("entry-1") as never);
    expect(res.status).toBe(500);
  });
});

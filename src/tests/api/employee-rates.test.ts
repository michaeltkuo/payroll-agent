/**
 * Unit tests for GET /api/admin/employees/[id]/rates,
 * POST /api/admin/employees/[id]/rates, and
 * DELETE /api/admin/employees/[id]/rates/[rateId]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { GET, POST } from "@/app/api/admin/employees/[id]/rates/route";
import { DELETE } from "@/app/api/admin/employees/[id]/rates/[rateId]/route";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

const MOCK_ADMIN_SESSION = { user: { email: "admin@example.com", role: "admin" } };
const MOCK_EMPLOYEE_SESSION = { user: { email: "employee@example.com", role: "employee" } };
const MOCK_EMPLOYEE = { id: "emp-uuid" };
const MOCK_RATES = [
  { id: "rate-1", employee_id: "emp-uuid", label: "Standard", hourly_rate: 50, is_default: true, created_at: "" },
  { id: "rate-2", employee_id: "emp-uuid", label: "Events", hourly_rate: 75, is_default: false, created_at: "" },
];

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

function makeParams(id: string, rateId?: string) {
  return { params: Promise.resolve({ id, rateId: rateId ?? "" }) };
}

// ---------------------------------------------------------------------------
// GET /api/admin/employees/[id]/rates
// ---------------------------------------------------------------------------
describe("GET /api/admin/employees/[id]/rates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(new NextRequest("http://localhost"), makeParams("emp-uuid") as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_EMPLOYEE_SESSION as never);
    const res = await GET(new NextRequest("http://localhost"), makeParams("emp-uuid") as never);
    expect(res.status).toBe(403);
  });

  it("returns 200 with rates array", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: MOCK_RATES, error: null });
    const res = await GET(new NextRequest("http://localhost"), makeParams("emp-uuid") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rates).toEqual(MOCK_RATES);
  });

  it("returns 500 on DB error", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: { message: "DB error" } });
    const res = await GET(new NextRequest("http://localhost"), makeParams("emp-uuid") as never);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/employees/[id]/rates
// ---------------------------------------------------------------------------
describe("POST /api/admin/employees/[id]/rates", () => {
  beforeEach(() => vi.clearAllMocks());

  function makePostRequest(body: Record<string, unknown>) {
    return new NextRequest("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makePostRequest({ label: "Standard", hourly_rate: 50 }), makeParams("emp-uuid") as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_EMPLOYEE_SESSION as never);
    const res = await POST(makePostRequest({ label: "Standard", hourly_rate: 50 }), makeParams("emp-uuid") as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 when label is missing", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const res = await POST(makePostRequest({ hourly_rate: 50 }), makeParams("emp-uuid") as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("label") });
  });

  it("returns 400 when hourly_rate is missing", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const res = await POST(makePostRequest({ label: "Standard" }), makeParams("emp-uuid") as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when hourly_rate is zero", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const res = await POST(makePostRequest({ label: "Standard", hourly_rate: 0 }), makeParams("emp-uuid") as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("positive") });
  });

  it("returns 400 when hourly_rate is negative", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const res = await POST(makePostRequest({ label: "Standard", hourly_rate: -10 }), makeParams("emp-uuid") as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when employee not found", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: null }); // employee lookup returns null
    const res = await POST(makePostRequest({ label: "Standard", hourly_rate: 50 }), makeParams("emp-uuid") as never);
    expect(res.status).toBe(404);
  });

  it("returns 201 and creates the rate", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const newRate = { ...MOCK_RATES[0] };
    makeFrom(
      { data: MOCK_EMPLOYEE, error: null }, // employee lookup
      { data: newRate, error: null },        // insert
    );
    const res = await POST(makePostRequest({ label: "Standard", hourly_rate: 50 }), makeParams("emp-uuid") as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rate).toEqual(newRate);
  });

  it("returns 500 on insert DB error", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: MOCK_EMPLOYEE, error: null },
      { data: null, error: { message: "insert error" } },
    );
    const res = await POST(makePostRequest({ label: "Standard", hourly_rate: 50 }), makeParams("emp-uuid") as never);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/employees/[id]/rates/[rateId]
// ---------------------------------------------------------------------------
describe("DELETE /api/admin/employees/[id]/rates/[rateId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("emp-uuid", "rate-1") as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_EMPLOYEE_SESSION as never);
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("emp-uuid", "rate-1") as never);
    expect(res.status).toBe(403);
  });

  it("returns 200 success", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: null });
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("emp-uuid", "rate-1") as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("returns 500 on DB error", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: { message: "delete error" } });
    const res = await DELETE(new NextRequest("http://localhost"), makeParams("emp-uuid", "rate-1") as never);
    expect(res.status).toBe(500);
  });
});

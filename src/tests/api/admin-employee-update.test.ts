/**
 * Unit tests for PATCH /api/admin/employees/[id]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { PATCH } from "@/app/api/admin/employees/[id]/route";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

const MOCK_ADMIN_SESSION = { user: { email: "admin@example.com", role: "admin" } };
const MOCK_EMPLOYEE_SESSION = { user: { email: "emp@example.com", role: "employee" } };

const MOCK_EMPLOYEE = {
  id: "emp-1",
  email: "alex@example.com",
  name: "Alex Rivera",
  role: "employee",
  pay_frequency: "semi_monthly",
};

function makeChain(value: { data: unknown; error: unknown }) {
  const methods = ["select", "eq", "update"] as const;
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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePatchRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/employees/emp-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/admin/employees/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest({ pay_frequency: "weekly" }), makeParams("emp-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_EMPLOYEE_SESSION as never);
    const res = await PATCH(makePatchRequest({ pay_frequency: "weekly" }), makeParams("emp-1"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when pay_frequency is missing", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const res = await PATCH(makePatchRequest({}), makeParams("emp-1"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/pay_frequency/);
  });

  it("returns 400 when pay_frequency is an invalid value", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const res = await PATCH(makePatchRequest({ pay_frequency: "biweekly" }), makeParams("emp-1"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/pay_frequency/);
  });

  it.each(["weekly", "semi_monthly", "monthly"])(
    "accepts a valid pay_frequency value: %s",
    async (freq) => {
      vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
      makeFrom({ data: { ...MOCK_EMPLOYEE, pay_frequency: freq }, error: null });
      const res = await PATCH(makePatchRequest({ pay_frequency: freq }), makeParams("emp-1"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { employee: typeof MOCK_EMPLOYEE };
      expect(json.employee.pay_frequency).toBe(freq);
    }
  );

  it("updates the correct employee id and column", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const fromFn = makeFrom({ data: MOCK_EMPLOYEE, error: null });
    await PATCH(makePatchRequest({ pay_frequency: "monthly" }), makeParams("emp-1"));
    const chain = fromFn.mock.results[0].value as Record<string, ReturnType<typeof vi.fn>>;
    expect(fromFn).toHaveBeenCalledWith("users");
    expect(chain.update).toHaveBeenCalledWith({ pay_frequency: "monthly" });
    expect(chain.eq).toHaveBeenCalledWith("id", "emp-1");
  });

  it("returns 404 when the employee does not exist", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: null });
    const res = await PATCH(makePatchRequest({ pay_frequency: "weekly" }), makeParams("missing-id"));
    expect(res.status).toBe(404);
  });

  it("returns 500 on database error", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: { message: "DB error" } });
    const res = await PATCH(makePatchRequest({ pay_frequency: "weekly" }), makeParams("emp-1"));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("DB error");
  });
});

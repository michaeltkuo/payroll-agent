/**
 * Unit tests for GET /api/admin/employees
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { GET } from "@/app/api/admin/employees/route";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

const MOCK_ADMIN_SESSION = { user: { email: "admin@example.com", role: "admin" } };
const MOCK_EMPLOYEE_SESSION = { user: { email: "emp@example.com", role: "employee" } };

const MOCK_EMPLOYEES = [
  {
    id: "emp-1",
    email: "alex@example.com",
    name: "Alex Rivera",
    image: null,
    role: "employee",
    employee_number: null,
    created_at: "2026-01-01T00:00:00Z",
    rates: [
      { id: "rate-1", employee_id: "emp-1", label: "Regular", hourly_rate: 75, is_default: true, created_at: "" },
    ],
  },
  {
    id: "emp-2",
    email: "jordan@example.com",
    name: "Jordan Lee",
    image: null,
    role: "employee",
    employee_number: null,
    created_at: "2026-01-02T00:00:00Z",
    rates: [],
  },
];

function makeChain(value: { data: unknown; error: unknown }) {
  const methods = ["select", "eq", "order", "in", "insert", "upsert", "update", "delete"] as const;
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

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/employees", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_EMPLOYEE_SESSION as never);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns employees with rates for admin", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: MOCK_EMPLOYEES, error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json() as { employees: typeof MOCK_EMPLOYEES };
    expect(json.employees).toHaveLength(2);
    expect(json.employees[0].name).toBe("Alex Rivera");
    expect(json.employees[0].rates).toHaveLength(1);
    expect(json.employees[1].rates).toHaveLength(0);
  });

  it("returns 500 on database error", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: { message: "DB error" } });
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("DB error");
  });

  it("returns empty array when no employees", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: [], error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json() as { employees: unknown[] };
    expect(json.employees).toHaveLength(0);
  });

  it("queries only users with role=employee", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const fromFn = makeFrom({ data: MOCK_EMPLOYEES, error: null });
    await GET();
    const chain = fromFn.mock.results[0].value as Record<string, ReturnType<typeof vi.fn>>;
    expect(chain.eq).toHaveBeenCalledWith("role", "employee");
  });
});

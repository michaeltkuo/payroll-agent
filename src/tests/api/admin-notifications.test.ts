/**
 * Unit tests for GET /api/admin/notifications and PATCH /api/admin/notifications
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { GET, PATCH } from "@/app/api/admin/notifications/route";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

const MOCK_ADMIN_SESSION = { user: { email: "admin@example.com", role: "admin" } };
const MOCK_EMPLOYEE_SESSION = { user: { email: "emp@example.com", role: "employee" } };

const MOCK_ADMIN_ROW = { id: "admin-uuid" };

const MOCK_NOTIFICATIONS = [
  {
    id: "notif-1",
    type: "timecard_submitted",
    message: "Alex submitted a timecard",
    timecard_id: "tc-1",
    read_at: null,
    created_at: "2026-06-02T10:00:00Z",
  },
  {
    id: "notif-2",
    type: "timecard_submitted",
    message: "Jordan submitted a timecard",
    timecard_id: "tc-2",
    read_at: "2026-06-01T09:00:00Z",
    created_at: "2026-06-01T08:00:00Z",
  },
];

// The value type is intentionally loose since a query result may resolve
// with `data`/`error` or, for a count query, `count`/`error`.
function makeChain(value: Record<string, unknown>) {
  const methods = ["select", "eq", "order", "limit", "is", "update"] as const;
  const builder: Record<string, unknown> = {};
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder);
  builder["single"] = vi.fn().mockResolvedValue(value);
  builder["maybeSingle"] = vi.fn().mockResolvedValue(value);
  builder["then"] = (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
    Promise.resolve(value).then(resolve, reject);
  return builder;
}

function makeFrom(...values: Array<Record<string, unknown>>) {
  const fromFn = vi.fn();
  for (const v of values) fromFn.mockReturnValueOnce(makeChain(v));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = fromFn;
  return fromFn;
}

function makePatchRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/notifications", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_EMPLOYEE_SESSION as never);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 404 when the admin user row cannot be found", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: null });
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns 500 when the notifications query errors", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: MOCK_ADMIN_ROW, error: null },
      { data: null, error: { message: "list boom" } }
    );
    const res = await GET();
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("list boom");
  });

  it("returns 500 when the unread-count query errors", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: MOCK_ADMIN_ROW, error: null },
      { data: MOCK_NOTIFICATIONS, error: null },
      { count: null, error: { message: "count boom" } }
    );
    const res = await GET();
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("count boom");
  });

  it("returns mapped notifications and unread count for the admin", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const fromFn = makeFrom(
      { data: MOCK_ADMIN_ROW, error: null },
      { data: MOCK_NOTIFICATIONS, error: null },
      { count: 1, error: null }
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      notifications: Array<{
        id: string;
        type: string;
        message: string;
        timecardId: string;
        readAt: string | null;
        createdAt: string;
      }>;
      unreadCount: number;
    };
    expect(json.unreadCount).toBe(1);
    expect(json.notifications).toHaveLength(2);
    expect(json.notifications[0]).toEqual({
      id: "notif-1",
      type: "timecard_submitted",
      message: "Alex submitted a timecard",
      timecardId: "tc-1",
      readAt: null,
      createdAt: "2026-06-02T10:00:00Z",
    });

    // The notifications list query is scoped to this admin's own rows.
    const listChain = fromFn.mock.results[1].value as Record<string, ReturnType<typeof vi.fn>>;
    expect(listChain.eq).toHaveBeenCalledWith("recipient_user_id", "admin-uuid");
    expect(listChain.limit).toHaveBeenCalledWith(50);
  });

  it("defaults unreadCount to 0 when count comes back null", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: MOCK_ADMIN_ROW, error: null },
      { data: [], error: null },
      { count: null, error: null }
    );
    const res = await GET();
    const json = (await res.json()) as { unreadCount: number };
    expect(json.unreadCount).toBe(0);
  });
});

describe("PATCH /api/admin/notifications", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest({ id: "notif-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_EMPLOYEE_SESSION as never);
    const res = await PATCH(makePatchRequest({ id: "notif-1" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when the admin user row cannot be found", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: null, error: { message: "no row" } });
    const res = await PATCH(makePatchRequest({ id: "notif-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when neither id nor markAll is provided", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom({ data: MOCK_ADMIN_ROW, error: null });
    const res = await PATCH(makePatchRequest({}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("id or markAll is required");
  });

  it("marks a single notification read by id", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const fromFn = makeFrom(
      { data: MOCK_ADMIN_ROW, error: null },
      { data: null, error: null }
    );
    const res = await PATCH(makePatchRequest({ id: "notif-1" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);

    const updateChain = fromFn.mock.results[1].value as Record<string, ReturnType<typeof vi.fn>>;
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ read_at: expect.any(String) })
    );
    expect(updateChain.eq).toHaveBeenCalledWith("id", "notif-1");
    expect(updateChain.eq).toHaveBeenCalledWith("recipient_user_id", "admin-uuid");
  });

  it("returns 500 when updating a single notification errors", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: MOCK_ADMIN_ROW, error: null },
      { data: null, error: { message: "update boom" } }
    );
    const res = await PATCH(makePatchRequest({ id: "notif-1" }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("update boom");
  });

  it("marks all of the admin's unread notifications read when markAll is true", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    const fromFn = makeFrom(
      { data: MOCK_ADMIN_ROW, error: null },
      { data: null, error: null }
    );
    const res = await PATCH(makePatchRequest({ markAll: true }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);

    const updateChain = fromFn.mock.results[1].value as Record<string, ReturnType<typeof vi.fn>>;
    expect(updateChain.eq).toHaveBeenCalledWith("recipient_user_id", "admin-uuid");
    expect(updateChain.is).toHaveBeenCalledWith("read_at", null);
  });

  it("returns 500 when the markAll update errors", async () => {
    vi.mocked(auth).mockResolvedValue(MOCK_ADMIN_SESSION as never);
    makeFrom(
      { data: MOCK_ADMIN_ROW, error: null },
      { data: null, error: { message: "markAll boom" } }
    );
    const res = await PATCH(makePatchRequest({ markAll: true }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("markAll boom");
  });
});

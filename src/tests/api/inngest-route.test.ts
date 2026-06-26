import { describe, expect, it, vi } from "vitest";

const serveMock = vi.fn(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
}));

const inngestClientMock = { id: "test-inngest" };
const payrollFnMock = { id: "payroll-fn" };
const keepAliveFnMock = { id: "keep-alive-fn" };

vi.mock("inngest/next", () => ({
  serve: serveMock,
}));

vi.mock("@/inngest/client", () => ({
  inngest: inngestClientMock,
}));

vi.mock("@/inngest", () => ({
  payrollAgentFn: payrollFnMock,
  supabaseKeepAliveFn: keepAliveFnMock,
}));

describe("/api/inngest route", () => {
  it("registers payroll and keep-alive functions with serve", async () => {
    await import("@/app/api/inngest/route");

    expect(serveMock).toHaveBeenCalledWith({
      client: inngestClientMock,
      functions: [payrollFnMock, keepAliveFnMock],
    });
  });
});

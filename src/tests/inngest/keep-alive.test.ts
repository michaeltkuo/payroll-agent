import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((config, handler) => ({ config, handler })),
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseKeepAliveFn } from "@/inngest/keep-alive";
import { supabaseAdmin } from "@/lib/supabase";

describe("supabaseKeepAliveFn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs daily on a cron trigger", () => {
    expect((supabaseKeepAliveFn as { config: { triggers: Array<{ cron: string }> } }).config.triggers).toEqual([
      { cron: "0 3 * * *" },
    ]);
  });

  it("runs a lightweight query against pay_periods", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "pp-1" }], error: null });
    const select = vi.fn().mockReturnValue({ limit });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((supabaseAdmin as any).from).mockReturnValue({ select });

    const step = { run: vi.fn(async (_name, fn) => fn()) };
    await (supabaseKeepAliveFn as { handler: (ctx: unknown) => Promise<void> }).handler({ step });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((supabaseAdmin as any).from).toHaveBeenCalledWith("pay_periods");
    expect(select).toHaveBeenCalledWith("id");
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("throws when the keep-alive query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "db offline" } });
    const select = vi.fn().mockReturnValue({ limit });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((supabaseAdmin as any).from).mockReturnValue({ select });

    const step = { run: vi.fn(async (_name, fn) => fn()) };
    await expect(
      (supabaseKeepAliveFn as { handler: (ctx: unknown) => Promise<void> }).handler({ step })
    ).rejects.toThrow("Failed keep-alive query: db offline");
  });
});

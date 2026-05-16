import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getWeekStart,
  generateWeeklyPeriod,
  parseWeekParam,
  getPayPeriodForWeek,
  getCurrentPayPeriod,
} from "@/lib/pay-periods";

// ---------------------------------------------------------------------------
// getWeekStart
// ---------------------------------------------------------------------------
describe("getWeekStart", () => {
  it("returns the same Sunday when the date is already a Sunday", () => {
    // 2025-05-11 is a Sunday
    const result = getWeekStart(new Date("2025-05-11T12:34:56"));
    expect(result.toISOString().slice(0, 10)).toBe("2025-05-11");
    expect(result.getDay()).toBe(0);
  });

  it.each([
    ["2025-05-12", "2025-05-11"], // Monday
    ["2025-05-13", "2025-05-11"], // Tuesday
    ["2025-05-14", "2025-05-11"], // Wednesday
    ["2025-05-15", "2025-05-11"], // Thursday
    ["2025-05-16", "2025-05-11"], // Friday
    ["2025-05-17", "2025-05-11"], // Saturday
  ])("%s → week start %s", (input, expected) => {
    const result = getWeekStart(new Date(input + "T00:00:00"));
    expect(result.toISOString().slice(0, 10)).toBe(expected);
  });

  it("zeroes out the time component", () => {
    const result = getWeekStart(new Date("2025-05-14T23:59:59"));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("does not mutate the input date", () => {
    const input = new Date("2025-05-14T12:00:00");
    const inputMs = input.getTime();
    getWeekStart(input);
    expect(input.getTime()).toBe(inputMs);
  });
});

// ---------------------------------------------------------------------------
// generateWeeklyPeriod
// ---------------------------------------------------------------------------
describe("generateWeeklyPeriod", () => {
  it("produces Sun–Sat for a mid-week date", () => {
    const { start_date, end_date } = generateWeeklyPeriod(new Date("2025-05-14T00:00:00"));
    expect(start_date).toBe("2025-05-11");
    expect(end_date).toBe("2025-05-17");
  });

  it("start_date is always a Sunday (getDay === 0)", () => {
    const { start_date } = generateWeeklyPeriod(new Date("2025-05-16T00:00:00"));
    expect(new Date(start_date + "T00:00:00").getDay()).toBe(0);
  });

  it("end_date is always a Saturday (getDay === 6)", () => {
    const { end_date } = generateWeeklyPeriod(new Date("2025-05-16T00:00:00"));
    expect(new Date(end_date + "T00:00:00").getDay()).toBe(6);
  });

  it("period spans exactly 6 days difference (7 days inclusive)", () => {
    const { start_date, end_date } = generateWeeklyPeriod(new Date("2025-05-11T00:00:00"));
    const diff =
      (new Date(end_date + "T00:00:00").getTime() - new Date(start_date + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24);
    expect(diff).toBe(6);
  });

  it("works correctly when input is already a Sunday", () => {
    const { start_date, end_date } = generateWeeklyPeriod(new Date("2025-05-11T00:00:00"));
    expect(start_date).toBe("2025-05-11");
    expect(end_date).toBe("2025-05-17");
  });
});

// ---------------------------------------------------------------------------
// parseWeekParam
// ---------------------------------------------------------------------------
describe("parseWeekParam", () => {
  it("returns the current week start when param is null", () => {
    const result = parseWeekParam(null);
    const today = new Date();
    const expected = getWeekStart(today).toISOString().slice(0, 10);
    expect(result.toISOString().slice(0, 10)).toBe(expected);
  });

  it("returns the current week start when param is undefined", () => {
    const result = parseWeekParam(undefined);
    expect(result.getDay()).toBe(0);
  });

  it("parses a valid ISO date string and normalises to that week's Sunday", () => {
    const result = parseWeekParam("2025-05-14"); // Wednesday
    expect(result.toISOString().slice(0, 10)).toBe("2025-05-11");
  });

  it("accepts a Sunday string and returns it unchanged", () => {
    const result = parseWeekParam("2025-05-11");
    expect(result.toISOString().slice(0, 10)).toBe("2025-05-11");
  });

  it("throws on an invalid date string", () => {
    expect(() => parseWeekParam("not-a-date")).toThrow("Invalid week parameter");
    expect(() => parseWeekParam("2025-13-01")).toThrow("Invalid week parameter");
  });
});

// ---------------------------------------------------------------------------
// Helpers for Supabase mock chain
// ---------------------------------------------------------------------------
function makeSelectChain(resolvedValue: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
  };
}

function makeInsertChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
  };
  return {
    insert: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// ---------------------------------------------------------------------------
// getPayPeriodForWeek
// ---------------------------------------------------------------------------
describe("getPayPeriodForWeek", () => {
  const mockPayPeriod = {
    id: "pp-test-uuid",
    start_date: "2025-05-11",
    end_date: "2025-05-17",
    status: "open",
    created_at: "2025-05-11T00:00:00Z",
  };
  const wednesday = new Date("2025-05-14T00:00:00");

  let mockFrom: ReturnType<typeof vi.fn>;
  let mockSupabase: SupabaseClient;

  beforeEach(() => {
    mockFrom = vi.fn();
    mockSupabase = { from: mockFrom } as unknown as SupabaseClient;
  });

  it("returns the existing pay period when found in DB", async () => {
    const selectChain = makeSelectChain({ data: mockPayPeriod, error: null });
    mockFrom.mockReturnValue(selectChain);

    const result = await getPayPeriodForWeek(mockSupabase, wednesday);

    expect(result).toEqual(mockPayPeriod);
    expect(selectChain.eq).toHaveBeenCalledWith("start_date", "2025-05-11");
    expect(selectChain.eq).toHaveBeenCalledWith("end_date", "2025-05-17");
  });

  it("creates a new pay period when none exists", async () => {
    const selectChain = makeSelectChain({ data: null, error: null });
    const insertPart = makeInsertChain({ data: mockPayPeriod, error: null });
    const insertBuilder = { ...selectChain, ...insertPart };

    mockFrom
      .mockReturnValueOnce(selectChain)        // first call: select
      .mockReturnValueOnce(insertBuilder);     // second call: insert

    const result = await getPayPeriodForWeek(mockSupabase, wednesday);

    expect(insertPart.insert).toHaveBeenCalledWith({
      start_date: "2025-05-11",
      end_date: "2025-05-17",
      status: "open",
    });
    expect(result).toEqual(mockPayPeriod);
  });

  it("throws when the DB select returns an error", async () => {
    const selectChain = makeSelectChain({ data: null, error: { message: "connection refused" } });
    mockFrom.mockReturnValue(selectChain);

    await expect(getPayPeriodForWeek(mockSupabase, wednesday)).rejects.toThrow(
      "Failed to fetch pay period: connection refused"
    );
  });

  it("throws when the DB insert returns an error", async () => {
    const selectChain = makeSelectChain({ data: null, error: null });
    const insertPart = makeInsertChain({ data: null, error: { message: "unique violation" } });
    const insertBuilder = { ...selectChain, ...insertPart };

    mockFrom
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(insertBuilder);

    await expect(getPayPeriodForWeek(mockSupabase, wednesday)).rejects.toThrow(
      "Failed to create pay period: unique violation"
    );
  });

  it("passes the Sunday date regardless of which weekday is provided", async () => {
    const saturday = new Date("2025-05-17T00:00:00");
    const selectChain = makeSelectChain({ data: mockPayPeriod, error: null });
    mockFrom.mockReturnValue(selectChain);

    await getPayPeriodForWeek(mockSupabase, saturday);

    expect(selectChain.eq).toHaveBeenCalledWith("start_date", "2025-05-11");
  });
});

// ---------------------------------------------------------------------------
// getCurrentPayPeriod
// ---------------------------------------------------------------------------
describe("getCurrentPayPeriod", () => {
  it("delegates to getPayPeriodForWeek using today's week start", async () => {
    const mockPayPeriod = {
      id: "pp-now",
      start_date: "irrelevant",
      end_date: "irrelevant",
      status: "open",
      created_at: "",
    };
    const selectChain = makeSelectChain({ data: mockPayPeriod, error: null });
    const mockFrom = vi.fn().mockReturnValue(selectChain);
    const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await getCurrentPayPeriod(mockSupabase);

    expect(result).toEqual(mockPayPeriod);

    // Verify it queried with today's week start (Sunday)
    const todayWeekStart = getWeekStart(new Date()).toISOString().slice(0, 10);
    expect(selectChain.eq).toHaveBeenCalledWith("start_date", todayWeekStart);
  });
});

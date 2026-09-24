import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getWeekStart,
  generateWeeklyPeriod,
  getSemiMonthlyPeriod,
  getMonthlyPeriod,
  getPeriodBoundsForFrequency,
  parseWeekParam,
  getPayPeriodForEmployee,
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
// getSemiMonthlyPeriod
// ---------------------------------------------------------------------------
describe("getSemiMonthlyPeriod", () => {
  it("returns the 1st–15th for a date in the first half of the month", () => {
    const { start_date, end_date } = getSemiMonthlyPeriod(new Date("2025-05-05T00:00:00"));
    expect(start_date).toBe("2025-05-01");
    expect(end_date).toBe("2025-05-15");
  });

  it("treats the 15th itself as the first half (on or before the 15th)", () => {
    const { start_date, end_date } = getSemiMonthlyPeriod(new Date("2025-05-15T00:00:00"));
    expect(start_date).toBe("2025-05-01");
    expect(end_date).toBe("2025-05-15");
  });

  it("returns the 16th–end-of-month for a date in the second half of the month", () => {
    const { start_date, end_date } = getSemiMonthlyPeriod(new Date("2025-05-20T00:00:00"));
    expect(start_date).toBe("2025-05-16");
    expect(end_date).toBe("2025-05-31");
  });

  it("treats the 16th itself as the start of the second half", () => {
    const { start_date } = getSemiMonthlyPeriod(new Date("2025-05-16T00:00:00"));
    expect(start_date).toBe("2025-05-16");
  });

  it("edge case: second half of a 28-day February (non-leap year)", () => {
    const { start_date, end_date } = getSemiMonthlyPeriod(new Date("2025-02-20T00:00:00"));
    expect(start_date).toBe("2025-02-16");
    expect(end_date).toBe("2025-02-28");
  });

  it("edge case: second half of a leap-year February (29 days)", () => {
    const { start_date, end_date } = getSemiMonthlyPeriod(new Date("2024-02-20T00:00:00"));
    expect(start_date).toBe("2024-02-16");
    expect(end_date).toBe("2024-02-29");
  });

  it("edge case: second half of a 31-day month", () => {
    const { start_date, end_date } = getSemiMonthlyPeriod(new Date("2025-01-25T00:00:00"));
    expect(start_date).toBe("2025-01-16");
    expect(end_date).toBe("2025-01-31");
  });

  it("edge case: end of December stays within December (no year rollover)", () => {
    const { start_date, end_date } = getSemiMonthlyPeriod(new Date("2025-12-31T00:00:00"));
    expect(start_date).toBe("2025-12-16");
    expect(end_date).toBe("2025-12-31");
  });

  it("first half of December", () => {
    const { start_date, end_date } = getSemiMonthlyPeriod(new Date("2025-12-01T00:00:00"));
    expect(start_date).toBe("2025-12-01");
    expect(end_date).toBe("2025-12-15");
  });
});

// ---------------------------------------------------------------------------
// getMonthlyPeriod
// ---------------------------------------------------------------------------
describe("getMonthlyPeriod", () => {
  it("returns the full calendar month for a 28-day February", () => {
    const { start_date, end_date } = getMonthlyPeriod(new Date("2025-02-10T00:00:00"));
    expect(start_date).toBe("2025-02-01");
    expect(end_date).toBe("2025-02-28");
  });

  it("returns the full calendar month for a 31-day month", () => {
    const { start_date, end_date } = getMonthlyPeriod(new Date("2025-01-10T00:00:00"));
    expect(start_date).toBe("2025-01-01");
    expect(end_date).toBe("2025-01-31");
  });

  it("returns the full calendar month for a 30-day month", () => {
    const { start_date, end_date } = getMonthlyPeriod(new Date("2025-04-15T00:00:00"));
    expect(start_date).toBe("2025-04-01");
    expect(end_date).toBe("2025-04-30");
  });

  it("handles a leap-year February (29 days)", () => {
    const { start_date, end_date } = getMonthlyPeriod(new Date("2024-02-15T00:00:00"));
    expect(start_date).toBe("2024-02-01");
    expect(end_date).toBe("2024-02-29");
  });
});

// ---------------------------------------------------------------------------
// getPeriodBoundsForFrequency
// ---------------------------------------------------------------------------
describe("getPeriodBoundsForFrequency", () => {
  it("dispatches to weekly bounds", () => {
    const referenceDate = new Date("2025-05-14T00:00:00"); // Wednesday
    const result = getPeriodBoundsForFrequency("weekly", referenceDate);
    expect(result).toEqual(generateWeeklyPeriod(referenceDate));
    expect(result.start_date).toBe("2025-05-11");
    expect(result.end_date).toBe("2025-05-17");
  });

  it("dispatches to semi-monthly bounds", () => {
    const referenceDate = new Date("2025-05-20T00:00:00");
    const result = getPeriodBoundsForFrequency("semi_monthly", referenceDate);
    expect(result).toEqual(getSemiMonthlyPeriod(referenceDate));
    expect(result.start_date).toBe("2025-05-16");
    expect(result.end_date).toBe("2025-05-31");
  });

  it("dispatches to monthly bounds", () => {
    const referenceDate = new Date("2025-05-20T00:00:00");
    const result = getPeriodBoundsForFrequency("monthly", referenceDate);
    expect(result).toEqual(getMonthlyPeriod(referenceDate));
    expect(result.start_date).toBe("2025-05-01");
    expect(result.end_date).toBe("2025-05-31");
  });

  it("throws on an unrecognized frequency", () => {
    expect(() => getPeriodBoundsForFrequency("biweekly", new Date())).toThrow(
      "Unrecognized pay frequency: biweekly"
    );
  });
});

// ---------------------------------------------------------------------------
// parseWeekParam
// ---------------------------------------------------------------------------
describe("parseWeekParam", () => {
  it("returns the current week start when param is null (defaults to weekly)", () => {
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

  it("normalises a first-half date to the 1st for semi_monthly", () => {
    const result = parseWeekParam("2025-05-05", "semi_monthly");
    expect(result.toISOString().slice(0, 10)).toBe("2025-05-01");
  });

  it("normalises a second-half date to the 16th for semi_monthly", () => {
    const result = parseWeekParam("2025-05-20", "semi_monthly");
    expect(result.toISOString().slice(0, 10)).toBe("2025-05-16");
  });

  it("normalises any date to the 1st for monthly", () => {
    const result = parseWeekParam("2025-05-20", "monthly");
    expect(result.toISOString().slice(0, 10)).toBe("2025-05-01");
  });

  it("throws on an unrecognized frequency", () => {
    expect(() => parseWeekParam("2025-05-20", "biweekly")).toThrow(
      "Unrecognized pay frequency: biweekly"
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers for Supabase mock chain (makeChain / makeFrom idiom, matching the
// pattern used in src/tests/api/*.test.ts)
// ---------------------------------------------------------------------------
function makeChain(value: { data: unknown; error: unknown }) {
  const methods = ["select", "eq", "insert", "order"] as const;
  const builder: Record<string, unknown> = {};

  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }

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
  for (const value of values) {
    fromFn.mockReturnValueOnce(makeChain(value));
  }
  return fromFn;
}

// ---------------------------------------------------------------------------
// getPayPeriodForEmployee
// ---------------------------------------------------------------------------
describe("getPayPeriodForEmployee", () => {
  const wednesday = new Date("2025-05-14T00:00:00"); // used for weekly cases
  const secondHalfDate = new Date("2025-05-20T00:00:00"); // used for semi_monthly cases

  const mockWeeklyPeriod = {
    id: "pp-weekly-uuid",
    start_date: "2025-05-11",
    end_date: "2025-05-17",
    status: "open",
    frequency: "weekly",
    created_at: "2025-05-11T00:00:00Z",
  };

  const mockSemiMonthlyPeriod = {
    id: "pp-semi-uuid",
    start_date: "2025-05-16",
    end_date: "2025-05-31",
    status: "open",
    frequency: "semi_monthly",
    created_at: "2025-05-16T00:00:00Z",
  };

  function buildSupabase(...values: Array<{ data: unknown; error: unknown }>) {
    return { from: makeFrom(...values) } as unknown as SupabaseClient;
  }

  describe("weekly", () => {
    const employee = { pay_frequency: "weekly" };

    it("returns the existing pay period when found in DB", async () => {
      const fromFn = makeFrom({ data: mockWeeklyPeriod, error: null });
      const supabase = { from: fromFn } as unknown as SupabaseClient;

      const result = await getPayPeriodForEmployee(supabase, employee, wednesday);

      expect(result).toEqual(mockWeeklyPeriod);
      const selectChain = fromFn.mock.results[0].value as ReturnType<typeof makeChain>;
      expect(selectChain.eq).toHaveBeenCalledWith("start_date", "2025-05-11");
      expect(selectChain.eq).toHaveBeenCalledWith("end_date", "2025-05-17");
      expect(selectChain.eq).toHaveBeenCalledWith("frequency", "weekly");
    });

    it("creates a new pay period when none exists", async () => {
      const supabase = buildSupabase(
        { data: null, error: null }, // select → not found
        { data: mockWeeklyPeriod, error: null } // insert → created
      );

      const result = await getPayPeriodForEmployee(supabase, employee, wednesday);

      const fromFn = vi.mocked(supabase.from);
      const insertChain = fromFn.mock.results[1].value as ReturnType<typeof makeChain>;
      expect(insertChain.insert).toHaveBeenCalledWith({
        start_date: "2025-05-11",
        end_date: "2025-05-17",
        status: "open",
        frequency: "weekly",
      });
      expect(result).toEqual(mockWeeklyPeriod);
    });

    it("throws when the DB select returns an error", async () => {
      const supabase = buildSupabase({ data: null, error: { message: "connection refused" } });

      await expect(getPayPeriodForEmployee(supabase, employee, wednesday)).rejects.toThrow(
        "Failed to fetch pay period: connection refused"
      );
    });

    it("throws when the DB insert returns an error", async () => {
      const supabase = buildSupabase(
        { data: null, error: null },
        { data: null, error: { message: "unique violation" } }
      );

      await expect(getPayPeriodForEmployee(supabase, employee, wednesday)).rejects.toThrow(
        "Failed to create pay period: unique violation"
      );
    });

    it("coerces null status to 'open' for pre-migration rows", async () => {
      const legacyPayPeriod = { ...mockWeeklyPeriod, status: null };
      const supabase = buildSupabase({ data: legacyPayPeriod, error: null });

      const result = await getPayPeriodForEmployee(supabase, employee, wednesday);

      expect(result.status).toBe("open");
    });

    it("leaves 'closed' status unchanged", async () => {
      const closedPayPeriod = { ...mockWeeklyPeriod, status: "closed" };
      const supabase = buildSupabase({ data: closedPayPeriod, error: null });

      const result = await getPayPeriodForEmployee(supabase, employee, wednesday);

      expect(result.status).toBe("closed");
    });
  });

  describe("semi_monthly", () => {
    const employee = { pay_frequency: "semi_monthly" };

    it("returns the existing semi-monthly pay period when found in DB", async () => {
      const fromFn = makeFrom({ data: mockSemiMonthlyPeriod, error: null });
      const supabase = { from: fromFn } as unknown as SupabaseClient;

      const result = await getPayPeriodForEmployee(supabase, employee, secondHalfDate);

      expect(result).toEqual(mockSemiMonthlyPeriod);
      const selectChain = fromFn.mock.results[0].value as ReturnType<typeof makeChain>;
      expect(selectChain.eq).toHaveBeenCalledWith("start_date", "2025-05-16");
      expect(selectChain.eq).toHaveBeenCalledWith("end_date", "2025-05-31");
      expect(selectChain.eq).toHaveBeenCalledWith("frequency", "semi_monthly");
    });

    it("creates a new semi-monthly pay period when none exists", async () => {
      const supabase = buildSupabase(
        { data: null, error: null },
        { data: mockSemiMonthlyPeriod, error: null }
      );

      const result = await getPayPeriodForEmployee(supabase, employee, secondHalfDate);

      const fromFn = vi.mocked(supabase.from);
      const insertChain = fromFn.mock.results[1].value as ReturnType<typeof makeChain>;
      expect(insertChain.insert).toHaveBeenCalledWith({
        start_date: "2025-05-16",
        end_date: "2025-05-31",
        status: "open",
        frequency: "semi_monthly",
      });
      expect(result).toEqual(mockSemiMonthlyPeriod);
    });
  });
});

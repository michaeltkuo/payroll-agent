import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayPeriod } from "@/types";

type PayFrequency = "weekly" | "semi_monthly" | "monthly";

interface PayPeriodBounds {
  start_date: string;
  end_date: string;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Last calendar day of the month containing `date` (handles Feb/28/29/30/31-day months). */
function lastDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Returns the most recent Sunday (start of week) for any given date.
 * Time is zeroed out to midnight.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // getDay() === 0 on Sunday, so Sunday stays
  return d;
}

/**
 * Returns the Sunday–Saturday date range for the week containing referenceDate.
 */
export function generateWeeklyPeriod(referenceDate: Date): PayPeriodBounds {
  const start = getWeekStart(referenceDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6); // Saturday
  return {
    start_date: toISODate(start),
    end_date: toISODate(end),
  };
}

/**
 * Returns the semi-monthly date range containing `date`: the 1st–15th when
 * the date falls on or before the 15th, otherwise the 16th–end-of-month.
 */
export function getSemiMonthlyPeriod(date: Date): PayPeriodBounds {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (date.getDate() <= 15) {
    return {
      start_date: toISODate(new Date(year, month, 1)),
      end_date: toISODate(new Date(year, month, 15)),
    };
  }

  return {
    start_date: toISODate(new Date(year, month, 16)),
    end_date: toISODate(new Date(year, month, lastDayOfMonth(date))),
  };
}

/**
 * Returns the calendar-month date range (1st–last day) containing `date`.
 */
export function getMonthlyPeriod(date: Date): PayPeriodBounds {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    start_date: toISODate(new Date(year, month, 1)),
    end_date: toISODate(new Date(year, month, lastDayOfMonth(date))),
  };
}

/**
 * Dispatches to the correct period-bounds calculator for the given pay
 * frequency. Throws on an unrecognized frequency.
 */
export function getPeriodBoundsForFrequency(
  frequency: string,
  referenceDate: Date
): PayPeriodBounds {
  switch (frequency) {
    case "weekly":
      return generateWeeklyPeriod(getWeekStart(referenceDate));
    case "semi_monthly":
      return getSemiMonthlyPeriod(referenceDate);
    case "monthly":
      return getMonthlyPeriod(referenceDate);
    default:
      throw new Error(`Unrecognized pay frequency: ${frequency}`);
  }
}

/**
 * Parses an optional week/period query/body param into a period-start Date,
 * normalized according to `frequency` (defaults to "weekly"):
 *  - weekly: normalized to that week's Sunday
 *  - semi_monthly: normalized to the 1st or the 16th of that month
 *  - monthly: normalized to the 1st of that month
 * Falls back to today's period start if the param is absent.
 * Throws "Invalid week parameter" if the value is an invalid date string.
 */
export function parseWeekParam(
  weekStr: string | null | undefined,
  frequency: PayFrequency | string = "weekly"
): Date {
  const parsed = weekStr ? new Date(weekStr + "T00:00:00") : new Date();
  if (isNaN(parsed.getTime())) throw new Error("Invalid week parameter");

  switch (frequency) {
    case "weekly":
      return getWeekStart(parsed);
    case "semi_monthly": {
      const day = parsed.getDate() <= 15 ? 1 : 16;
      const normalized = new Date(parsed);
      normalized.setHours(0, 0, 0, 0);
      normalized.setDate(day);
      return normalized;
    }
    case "monthly": {
      const normalized = new Date(parsed);
      normalized.setHours(0, 0, 0, 0);
      normalized.setDate(1);
      return normalized;
    }
    default:
      throw new Error(`Unrecognized pay frequency: ${frequency}`);
  }
}

/**
 * Fetches the pay period matching the exact start/end/frequency window for
 * `employee` around `referenceDate`. Creates a new open pay period (tagged
 * with the resolved frequency) if none exists for that window.
 */
export async function getPayPeriodForEmployee(
  supabase: SupabaseClient,
  employee: { pay_frequency: string },
  referenceDate: Date
): Promise<PayPeriod> {
  const frequency = employee.pay_frequency;
  const { start_date, end_date } = getPeriodBoundsForFrequency(
    frequency,
    referenceDate
  );

  const { data: existing, error } = await supabase
    .from("pay_periods")
    .select("*")
    .eq("start_date", start_date)
    .eq("end_date", end_date)
    .eq("frequency", frequency)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch pay period: ${error.message}`);
  if (existing) {
    // Rows created before the status column was added may have null; default to "open"
    const pp = existing as PayPeriod & { status: string | null };
    if (!pp.status) pp.status = "open";
    return pp as PayPeriod;
  }

  const { data: created, error: createError } = await supabase
    .from("pay_periods")
    .insert({ start_date, end_date, status: "open", frequency })
    .select()
    .single();

  if (createError)
    throw new Error(`Failed to create pay period: ${createError.message}`);

  return created as PayPeriod;
}

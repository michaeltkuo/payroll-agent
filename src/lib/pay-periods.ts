import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayPeriod } from "@/types";

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
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
export function generateWeeklyPeriod(referenceDate: Date): {
  start_date: string;
  end_date: string;
} {
  const start = getWeekStart(referenceDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6); // Saturday
  return {
    start_date: toISODate(start),
    end_date: toISODate(end),
  };
}

/**
 * Parses an optional week query/body param into a week-start Date.
 * Falls back to the current week if the param is absent.
 * Throws with a descriptive message if the value is an invalid date string.
 */
export function parseWeekParam(weekStr: string | null | undefined): Date {
  if (!weekStr) return getWeekStart(new Date());
  const parsed = new Date(weekStr + "T00:00:00");
  if (isNaN(parsed.getTime())) throw new Error("Invalid week parameter");
  return getWeekStart(parsed);
}

/**
 * Fetches the pay period matching the exact Sunday–Saturday window of weekStart.
 * Creates a new open pay period if none exists for that week.
 */
export async function getPayPeriodForWeek(
  supabase: SupabaseClient,
  weekStart: Date
): Promise<PayPeriod> {
  const { start_date, end_date } = generateWeeklyPeriod(weekStart);

  const { data: existing, error } = await supabase
    .from("pay_periods")
    .select("*")
    .eq("start_date", start_date)
    .eq("end_date", end_date)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch pay period: ${error.message}`);
  if (existing) return existing as PayPeriod;

  const { data: created, error: createError } = await supabase
    .from("pay_periods")
    .insert({ start_date, end_date, status: "open" })
    .select()
    .single();

  if (createError)
    throw new Error(`Failed to create pay period: ${createError.message}`);

  return created as PayPeriod;
}

/** Fetches (or creates) the pay period for the current week. */
export async function getCurrentPayPeriod(
  supabase: SupabaseClient
): Promise<PayPeriod> {
  return getPayPeriodForWeek(supabase, new Date());
}

/** Ensures a pay period exists for the current week. Safe to call on app start. */
export async function ensurePayPeriodExists(
  supabase: SupabaseClient
): Promise<PayPeriod> {
  return getCurrentPayPeriod(supabase);
}

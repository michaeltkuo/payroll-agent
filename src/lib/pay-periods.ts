import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayPeriod } from "@/types";

/** Anchor date: the start of the first bi-weekly period (a Sunday) */
const ANCHOR_DATE = new Date("2025-01-05T00:00:00.000Z");
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Given any date, returns the start and end dates of the bi-weekly pay period
 * it falls in, anchored to 2025-01-05.
 */
export function generateBiweeklyPeriod(referenceDate: Date): {
  start_date: string;
  end_date: string;
} {
  const refMs = referenceDate.getTime();
  const anchorMs = ANCHOR_DATE.getTime();
  const diff = refMs - anchorMs;
  const periodIndex = Math.floor(diff / TWO_WEEKS_MS);

  const startMs = anchorMs + periodIndex * TWO_WEEKS_MS;
  const endMs = startMs + TWO_WEEKS_MS - 1;

  return {
    start_date: toISODate(new Date(startMs)),
    end_date: toISODate(new Date(endMs)),
  };
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Fetches the current open pay period from DB.
 * Creates one if none exists.
 */
export async function getCurrentPayPeriod(
  supabase: SupabaseClient
): Promise<PayPeriod> {
  const today = new Date();
  const { start_date, end_date } = generateBiweeklyPeriod(today);

  // Look for an existing open period that covers today
  const { data: existing, error } = await supabase
    .from("pay_periods")
    .select("*")
    .eq("status", "open")
    .lte("start_date", toISODate(today))
    .gte("end_date", toISODate(today))
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch pay period: ${error.message}`);
  if (existing) return existing as PayPeriod;

  // Create the period for the current bi-weekly window
  const { data: created, error: createError } = await supabase
    .from("pay_periods")
    .insert({ start_date, end_date, status: "open" })
    .select()
    .single();

  if (createError)
    throw new Error(`Failed to create pay period: ${createError.message}`);

  return created as PayPeriod;
}

/**
 * Ensures a pay period exists for the current date.
 * Safe to call on every login/app start.
 */
export async function ensurePayPeriodExists(
  supabase: SupabaseClient
): Promise<PayPeriod> {
  return getCurrentPayPeriod(supabase);
}

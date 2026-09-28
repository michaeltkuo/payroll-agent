import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayPeriod, Timecard } from "@/types";

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

/**
 * Finds the (employee, pay period) timecard, creating a draft one if it
 * doesn't exist yet. Mirrors Postgres upsert-with-ignoreDuplicates, which
 * returns no row on a duplicate — so a fallback SELECT resolves the
 * already-existing row in that case.
 */
export async function getOrCreateTimecard(
  supabase: SupabaseClient,
  employeeId: string,
  payPeriodId: string
): Promise<Timecard> {
  const { data: upserted, error: upsertError } = await supabase
    .from("timecards")
    .upsert(
      { employee_id: employeeId, pay_period_id: payPeriodId },
      { onConflict: "employee_id,pay_period_id", ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();

  if (upserted) return upserted as Timecard;

  const { data: existing, error: fetchError } = await supabase
    .from("timecards")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("pay_period_id", payPeriodId)
    .single();

  if (!existing) {
    const message = (upsertError ?? fetchError)?.message ?? "unknown error";
    throw new Error(`Failed to get or create timecard: ${message}`);
  }

  return existing as Timecard;
}

export interface ReconciliationSummary {
  entriesMoved: number;
  timecardsDeleted: number;
  periodsTouched: number;
  skipped: Array<{ payPeriodId: string; reason: string }>;
}

interface ReconcileTimeEntry {
  id: string;
  work_date: string;
  entry_order: number;
}

interface ReconcileSourceTimecard {
  id: string;
  status: string;
  pay_period: { id: string; start_date: string; end_date: string; frequency: string } | null;
  entries: ReconcileTimeEntry[];
}

/**
 * When an employee's pay_frequency changes, their still-editable (draft or
 * rejected) timecards remain attached to pay_periods rows tagged with the
 * OLD frequency — invisible to every future read/write, which always
 * resolves periods via the employee's CURRENT frequency. This reassigns
 * those entries onto the correct new-frequency period/timecard so nothing
 * silently disappears from the employee's dashboard.
 *
 * Submitted/approved/sent_to_payroll timecards are finalized payroll
 * history and are intentionally left untouched — they're already surfaced
 * correctly by /api/admin/payroll-runs, which matches pay_periods by date
 * overlap rather than by the employee's current frequency.
 *
 * Safe to re-run: each call re-queries by frequency mismatch, so a partial
 * failure just leaves less work for the next run.
 */
export async function reconcileDraftTimecardsForFrequencyChange(
  supabase: SupabaseClient,
  employeeId: string,
  newFrequency: string
): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    entriesMoved: 0,
    timecardsDeleted: 0,
    periodsTouched: 0,
    skipped: [],
  };

  const { data: timecardsRaw, error } = await supabase
    .from("timecards")
    .select(
      "id, status, pay_period:pay_periods(id, start_date, end_date, frequency), entries:time_entries(id, work_date, entry_order)"
    )
    .eq("employee_id", employeeId)
    .in("status", ["draft", "rejected"]);

  if (error) {
    throw new Error(`Failed to load timecards for reconciliation: ${error.message}`);
  }

  const sourceTimecards = ((timecardsRaw ?? []) as unknown as ReconcileSourceTimecard[]).filter(
    (tc) => tc.pay_period && tc.pay_period.frequency !== newFrequency && tc.entries.length > 0
  );

  if (sourceTimecards.length === 0) return summary;

  // Group every entry, across ALL source timecards, by the target period it
  // lands in under newFrequency — two old timecards can map into the same
  // new period and must merge into one target, not two.
  const groups = new Map<
    string,
    {
      start_date: string;
      end_date: string;
      entries: { sourceTimecardId: string; entry: ReconcileTimeEntry }[];
    }
  >();

  for (const tc of sourceTimecards) {
    for (const entry of tc.entries) {
      const bounds = getPeriodBoundsForFrequency(newFrequency, new Date(`${entry.work_date}T00:00:00`));
      const key = `${bounds.start_date}_${bounds.end_date}`;
      if (!groups.has(key)) groups.set(key, { ...bounds, entries: [] });
      groups.get(key)!.entries.push({ sourceTimecardId: tc.id, entry });
    }
  }

  // sourceId -> targetTimecardId -> number of that source's entries moved there
  const movedBySource = new Map<string, Map<string, number>>();

  for (const group of groups.values()) {
    const targetPeriod = await getPayPeriodForEmployee(
      supabase,
      { pay_frequency: newFrequency },
      new Date(`${group.start_date}T00:00:00`)
    );
    const targetTimecard = await getOrCreateTimecard(supabase, employeeId, targetPeriod.id);

    if (!["draft", "rejected"].includes(targetTimecard.status)) {
      // The employee already has finalized payroll history for this exact
      // period under the new frequency (e.g. they were switched back and
      // forth) — never merge in-progress entries into finalized data.
      summary.skipped.push({
        payPeriodId: targetPeriod.id,
        reason: `Target timecard is already '${targetTimecard.status}'; left ${group.entries.length} entr${group.entries.length === 1 ? "y" : "ies"} in place`,
      });
      continue;
    }

    const { data: existingTargetEntries } = await supabase
      .from("time_entries")
      .select("work_date, entry_order")
      .eq("timecard_id", targetTimecard.id);

    const nextOrderByDate = new Map<string, number>();
    for (const e of (existingTargetEntries ?? []) as { work_date: string; entry_order: number }[]) {
      nextOrderByDate.set(e.work_date, Math.max(nextOrderByDate.get(e.work_date) ?? 0, e.entry_order + 1));
    }

    for (const { sourceTimecardId, entry } of group.entries) {
      const order = nextOrderByDate.get(entry.work_date) ?? 0;
      nextOrderByDate.set(entry.work_date, order + 1);

      const { error: updateError } = await supabase
        .from("time_entries")
        .update({ timecard_id: targetTimecard.id, entry_order: order })
        .eq("id", entry.id);

      if (updateError) {
        throw new Error(`Failed to move entry ${entry.id}: ${updateError.message}`);
      }

      summary.entriesMoved += 1;
      const bySource = movedBySource.get(sourceTimecardId) ?? new Map<string, number>();
      bySource.set(targetTimecard.id, (bySource.get(targetTimecard.id) ?? 0) + 1);
      movedBySource.set(sourceTimecardId, bySource);
    }

    summary.periodsTouched += 1;
  }

  // Clean up any source timecard that was fully emptied out.
  for (const tc of sourceTimecards) {
    const movedByTarget = movedBySource.get(tc.id);
    const totalMoved = movedByTarget
      ? Array.from(movedByTarget.values()).reduce((a, b) => a + b, 0)
      : 0;
    if (totalMoved !== tc.entries.length) continue; // some entries were left in place (skipped group)

    // A `rejected` timecard is the same row that received submit-time admin
    // notifications (rejecting doesn't create a new one) — re-point them to
    // whichever target absorbed most of its entries so that history survives
    // the delete below instead of cascading away.
    let bestTarget: string | null = null;
    let bestCount = -1;
    for (const [targetId, count] of movedByTarget!.entries()) {
      if (count > bestCount) {
        bestTarget = targetId;
        bestCount = count;
      }
    }
    if (bestTarget) {
      await supabase.from("notifications").update({ timecard_id: bestTarget }).eq("timecard_id", tc.id);
    }

    await supabase.from("timecards").delete().eq("id", tc.id);
    summary.timecardsDeleted += 1;
  }

  return summary;
}

/**
 * One-time backfill: reconcile draft/rejected timecard entries that were
 * orphaned when an employee's pay_frequency was changed before the
 * reconciliation guardrail existed in PATCH /api/admin/employees/[id]
 * (see AGENTS.md, "Admin: pay frequency, payroll runs, and notifications").
 *
 * Those entries still exist in `time_entries`, attached to `pay_periods`
 * rows tagged with the employee's OLD frequency — invisible to the
 * dashboard, which always resolves periods via the employee's CURRENT
 * frequency. This finds every employee in that state and reconciles them
 * using the exact same `reconcileDraftTimecardsForFrequencyChange` logic
 * the guardrail now runs automatically on every future frequency change.
 *
 * Submitted/approved/sent_to_payroll history is never touched — it's
 * already surfaced correctly by GET /api/admin/payroll-runs.
 *
 * Usage:
 *   npm run backfill:pay-frequency            # dry run — reports only
 *   npm run backfill:pay-frequency -- --yes   # applies the reconciliation
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "..", ".env.local") });

/* eslint-disable @typescript-eslint/no-explicit-any */

async function main() {
  const { supabaseAdmin } = await import("../src/lib/supabase");
  const { reconcileDraftTimecardsForFrequencyChange, getPeriodBoundsForFrequency } = await import(
    "../src/lib/pay-periods"
  );

  const APPLY = process.argv.includes("--yes");

  const { data: users, error: usersError } = await supabaseAdmin
    .from("users")
    .select("id, name, pay_frequency")
    .eq("role", "employee");

  if (usersError) throw new Error(`Failed to load employees: ${usersError.message}`);

  interface AffectedEmployee {
    id: string;
    name: string | null;
    pay_frequency: string;
    orphanedTimecards: number;
    orphanedEntries: number;
  }

  const affected: AffectedEmployee[] = [];

  for (const user of (users ?? []) as { id: string; name: string | null; pay_frequency: string }[]) {
    const { data: timecards, error: timecardsError } = await supabaseAdmin
      .from("timecards")
      .select(
        "id, status, pay_period:pay_periods(start_date, end_date, frequency), entries:time_entries(id, work_date)"
      )
      .eq("employee_id", user.id)
      .in("status", ["draft", "rejected"]);

    if (timecardsError) {
      throw new Error(`Failed to load timecards for ${user.name ?? user.id}: ${timecardsError.message}`);
    }

    const orphaned = (timecards ?? []).filter(
      (tc: any) => tc.pay_period?.frequency !== user.pay_frequency && (tc.entries ?? []).length > 0
    );

    if (orphaned.length === 0) continue;

    const entryCount = orphaned.reduce((sum: number, tc: any) => sum + tc.entries.length, 0);
    affected.push({
      id: user.id,
      name: user.name,
      pay_frequency: user.pay_frequency,
      orphanedTimecards: orphaned.length,
      orphanedEntries: entryCount,
    });

    console.log(
      `\n${user.name ?? user.id} — now "${user.pay_frequency}", ${orphaned.length} old-frequency timecard(s), ${entryCount} entr${entryCount === 1 ? "y" : "ies"} affected:`
    );
    for (const tc of orphaned as any[]) {
      console.log(
        `  - ${tc.pay_period.frequency} period ${tc.pay_period.start_date}–${tc.pay_period.end_date} (timecard ${tc.status}): ${tc.entries.length} entr${tc.entries.length === 1 ? "y" : "ies"}`
      );
      for (const entry of tc.entries as { id: string; work_date: string }[]) {
        const target = getPeriodBoundsForFrequency(user.pay_frequency, new Date(`${entry.work_date}T00:00:00`));
        console.log(`      ${entry.work_date} → will move to ${target.start_date}–${target.end_date}`);
      }
    }
  }

  if (affected.length === 0) {
    console.log("No employees have orphaned draft/rejected entries. Nothing to do.");
    return;
  }

  if (!APPLY) {
    console.log(
      `\nDry run only — ${affected.length} employee(s) affected. Re-run with --yes to apply these changes.`
    );
    return;
  }

  console.log(`\nApplying reconciliation for ${affected.length} employee(s)...`);
  for (const user of affected) {
    const summary = await reconcileDraftTimecardsForFrequencyChange(
      supabaseAdmin,
      user.id,
      user.pay_frequency
    );
    console.log(`  ${user.name ?? user.id}:`, summary);
  }
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

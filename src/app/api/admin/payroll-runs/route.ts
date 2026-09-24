export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getSemiMonthlyPeriod } from "@/lib/pay-periods";

interface PayrollRunTimecard {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
}

interface PayrollRunEmployee {
  employeeId: string;
  name: string | null;
  payFrequency: string;
  timecards: PayrollRunTimecard[];
}

/**
 * GET /api/admin/payroll-runs?date=YYYY-MM-DD
 *
 * Computes the semi-monthly "run window" (1st–15th or 16th–end-of-month)
 * containing `date` (defaults to today), then returns, for every employee,
 * every timecard whose linked pay_periods row overlaps that window
 * (overlap = period.start_date <= runEnd AND period.end_date >= runStart).
 * This naturally covers a weekly employee's possibly-multiple relevant
 * weekly timecards and a semi-monthly employee's single matching timecard.
 *
 * A monthly period spans the whole month, so it overlaps *both* semi-monthly
 * windows within that month under the same overlap test — it's attributed
 * only to the window that starts on the same day the monthly period does
 * (i.e. the 1st–15th run) so a monthly employee's timecard isn't double-counted.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dateParam = req.nextUrl.searchParams.get("date");
  const referenceDate = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  if (isNaN(referenceDate.getTime())) {
    return NextResponse.json({ error: "Invalid date parameter" }, { status: 400 });
  }

  const { start_date: runStart, end_date: runEnd } = getSemiMonthlyPeriod(referenceDate);

  const { data: employees, error: employeesError } = await supabaseAdmin
    .from("users")
    .select("id, name, pay_frequency")
    .eq("role", "employee")
    .order("name", { ascending: true });

  if (employeesError) {
    return NextResponse.json({ error: employeesError.message }, { status: 500 });
  }

  // Pay periods (of any frequency) whose window overlaps the run window
  const { data: overlappingPeriods, error: periodsError } = await supabaseAdmin
    .from("pay_periods")
    .select("id, start_date, end_date, frequency")
    .lte("start_date", runEnd)
    .gte("end_date", runStart);

  if (periodsError) {
    return NextResponse.json({ error: periodsError.message }, { status: 500 });
  }

  // A monthly period overlaps both semi-monthly windows in its month; only
  // attribute it to the window that starts on the same day it does, so a
  // monthly employee's timecard isn't shown twice.
  const relevantPeriods = (overlappingPeriods ?? []).filter(
    (p) => p.frequency !== "monthly" || p.start_date === runStart
  );

  const periodById = new Map(
    relevantPeriods.map((p) => [p.id as string, p as { start_date: string; end_date: string }])
  );
  const periodIds = Array.from(periodById.keys());

  const timecardsByEmployee = new Map<string, PayrollRunTimecard[]>();

  if (periodIds.length > 0) {
    const { data: timecards, error: timecardsError } = await supabaseAdmin
      .from("timecards")
      .select("id, status, employee_id, pay_period_id, entries:time_entries(total_hours)")
      .in("pay_period_id", periodIds);

    if (timecardsError) {
      return NextResponse.json({ error: timecardsError.message }, { status: 500 });
    }

    for (const tc of timecards ?? []) {
      const period = periodById.get(tc.pay_period_id as string);
      if (!period) continue;

      const totalHours = ((tc.entries ?? []) as { total_hours: number | null }[]).reduce(
        (sum, e) => sum + (e.total_hours ?? 0),
        0
      );

      const list = timecardsByEmployee.get(tc.employee_id as string) ?? [];
      list.push({
        id: tc.id as string,
        status: tc.status as string,
        periodStart: period.start_date,
        periodEnd: period.end_date,
        totalHours,
      });
      timecardsByEmployee.set(tc.employee_id as string, list);
    }
  }

  const result: PayrollRunEmployee[] = (employees ?? []).map((employee) => ({
    employeeId: employee.id as string,
    name: employee.name as string | null,
    payFrequency: employee.pay_frequency as string,
    timecards: timecardsByEmployee.get(employee.id as string) ?? [],
  }));

  return NextResponse.json({
    runStart,
    runEnd,
    employees: result,
  });
}

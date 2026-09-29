export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getPayPeriodForEmployee, parseWeekParam } from "@/lib/pay-periods";
import type { Timecard, TimeEntry } from "@/types";

/**
 * GET /api/timecard?week=YYYY-MM-DD — fetch (or create) the timecard + entries for a given period.
 *
 * Admins may pass `?asEmployeeId=<id>` to view that employee's timecard read-only (the response's
 * `viewingAs` field signals this to the client, which forces isEditable=false). No mutating route
 * accepts this param — the acting identity for every write is always the caller's own session.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const asEmployeeId = req.nextUrl.searchParams.get("asEmployeeId");
  let user: { id: string; pay_frequency: string };
  let viewingAs: { id: string; name: string | null; email: string } | null = null;

  if (asEmployeeId) {
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("users")
      .select("id, name, email, pay_frequency, role")
      .eq("id", asEmployeeId)
      .maybeSingle();

    if (targetError || !targetUser || targetUser.role !== "employee") {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    console.log(`[view-as] admin ${session.user.email} viewed employee ${targetUser.id}'s timecard`);
    user = { id: targetUser.id, pay_frequency: targetUser.pay_frequency };
    viewingAs = { id: targetUser.id, name: targetUser.name, email: targetUser.email };
  } else {
    const { data: ownUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, pay_frequency")
      .eq("email", session.user.email)
      .maybeSingle();

    if (userError || !ownUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    user = ownUser;
  }

  let weekStart;
  try {
    weekStart = parseWeekParam(req.nextUrl.searchParams.get("week"), user.pay_frequency);
  } catch {
    return NextResponse.json({ error: "Invalid week parameter" }, { status: 400 });
  }

  const payPeriod = await getPayPeriodForEmployee(supabaseAdmin, user, weekStart);

  // Upsert timecard (creates draft if not yet present)
  const { data: timecard, error: tcError } = await supabaseAdmin
    .from("timecards")
    .upsert(
      { employee_id: user.id, pay_period_id: payPeriod.id },
      { onConflict: "employee_id,pay_period_id", ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();

  // If upsert returned nothing (ignoreDuplicates=true and row already existed), fetch it
  let resolvedTimecard: Timecard | null = timecard as Timecard | null;
  if (!resolvedTimecard) {
    const { data: existing } = await supabaseAdmin
      .from("timecards")
      .select("*")
      .eq("employee_id", user.id)
      .eq("pay_period_id", payPeriod.id)
      .single();
    resolvedTimecard = existing as Timecard;
  }

  if (tcError && !resolvedTimecard) {
    return NextResponse.json(
      { error: `Failed to get timecard: ${tcError.message}` },
      { status: 500 }
    );
  }

  const { data: entries } = await supabaseAdmin
    .from("time_entries")
    .select("*, rate:employee_rates(*)")
    .eq("timecard_id", resolvedTimecard!.id)
    .order("work_date", { ascending: true })
    .order("entry_order", { ascending: true });

  // Also fetch the employee's available rates for the dropdown
  const { data: rates } = await supabaseAdmin
    .from("employee_rates")
    .select("*")
    .eq("employee_id", user.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    timecard: resolvedTimecard,
    entries: (entries ?? []) as TimeEntry[],
    pay_period: payPeriod,
    rates: rates ?? [],
    pay_frequency: user.pay_frequency,
    viewingAs,
  });
}

/** POST /api/timecard — insert a new time entry (multiple allowed per day) */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    week?: string;
    work_date: string;
    clock_in?: string;
    clock_out?: string;
    notes?: string;
    rate_id?: string | null;
  };

  if (!body.work_date) {
    return NextResponse.json({ error: "work_date is required" }, { status: 400 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, pay_frequency")
    .eq("email", session.user.email)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let weekStart;
  try {
    weekStart = parseWeekParam(body.week, user.pay_frequency);
  } catch {
    return NextResponse.json({ error: "Invalid week parameter" }, { status: 400 });
  }

  const payPeriod = await getPayPeriodForEmployee(supabaseAdmin, user, weekStart);

  const { data: timecard } = await supabaseAdmin
    .from("timecards")
    .select("id, status")
    .eq("employee_id", user.id)
    .eq("pay_period_id", payPeriod.id)
    .maybeSingle();

  if (!timecard) {
    return NextResponse.json({ error: "Timecard not found" }, { status: 404 });
  }

  if (!["draft", "rejected"].includes(timecard.status)) {
    return NextResponse.json(
      { error: "Timecard is not editable in its current state" },
      { status: 409 }
    );
  }

  // Compute next entry_order for this date
  const { data: existing } = await supabaseAdmin
    .from("time_entries")
    .select("entry_order")
    .eq("timecard_id", timecard.id)
    .eq("work_date", body.work_date)
    .order("entry_order", { ascending: false });

  const maxOrder = existing && existing.length > 0 ? (existing[0].entry_order ?? 0) : -1;

  const { data: entry, error: entryError } = await supabaseAdmin
    .from("time_entries")
    .insert({
      timecard_id: timecard.id,
      work_date: body.work_date,
      clock_in: body.clock_in ?? null,
      clock_out: body.clock_out ?? null,
      notes: body.notes ?? null,
      rate_id: body.rate_id ?? null,
      entry_order: maxOrder + 1,
    })
    .select("*, rate:employee_rates(*)")
    .single();

  if (entryError) {
    return NextResponse.json(
      { error: entryError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ entry });
}

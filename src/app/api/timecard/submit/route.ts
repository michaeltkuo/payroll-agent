export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getPayPeriodForEmployee, parseWeekParam } from "@/lib/pay-periods";
import { inngest } from "@/inngest/client";
import type { TimeEntry } from "@/types";

/** POST /api/timecard/submit — submit a timecard for approval */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { week?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional; defaults to current period
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, name, email, pay_frequency")
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
      { error: "Timecard cannot be submitted in its current state" },
      { status: 409 }
    );
  }

  const { data: entries } = await supabaseAdmin
    .from("time_entries")
    .select("*")
    .eq("timecard_id", timecard.id);

  const entryList = (entries ?? []) as TimeEntry[];

  if (entryList.length === 0) {
    return NextResponse.json(
      { error: "Timecard must have at least one time entry before submitting" },
      { status: 422 }
    );
  }

  const incomplete = entryList.filter((e) => !e.clock_in || !e.clock_out);
  if (incomplete.length > 0) {
    return NextResponse.json(
      {
        error: "All time entries must have both clock-in and clock-out times",
        incomplete_dates: incomplete.map((e) => e.work_date),
      },
      { status: 422 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("timecards")
    .update({ status: "submitted", submitted_at: new Date().toISOString(), rejection_note: null })
    .eq("id", timecard.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const employeeName = user.name ?? user.email ?? "An employee";
  const notificationMessage = `${employeeName} submitted a timecard for ${payPeriod.start_date}–${payPeriod.end_date}`;

  // Notify admins in-app. Best-effort: the timecard is already submitted, so a
  // notification/event delivery hiccup here should not surface as a failed submit.
  const { data: admins, error: adminsError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("role", "admin");

  if (adminsError) {
    console.error("Failed to fetch admins for notifications:", adminsError.message);
  } else if (admins && admins.length > 0) {
    const { error: notifyError } = await supabaseAdmin.from("notifications").insert(
      admins.map((admin) => ({
        recipient_user_id: admin.id,
        type: "timecard_submitted",
        timecard_id: timecard.id,
        message: notificationMessage,
      }))
    );
    if (notifyError) {
      console.error("Failed to insert admin notifications:", notifyError.message);
    }
  }

  // Fire Inngest event for downstream automation (listener added separately)
  await inngest.send({
    name: "payroll/timecard.submitted",
    data: {
      timecardId: timecard.id,
      employeeId: user.id,
      employeeName,
      periodStart: payPeriod.start_date,
      periodEnd: payPeriod.end_date,
    },
  });

  return NextResponse.json({ success: true });
}

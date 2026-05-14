export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

/** GET /api/admin/timecards — all submitted/approved/rejected timecards with details */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("timecards")
    .select(
      `
      *,
      employee:users(*),
      pay_period:pay_periods(*),
      entries:time_entries(*)
    `
    )
    .in("status", ["submitted", "approved", "rejected", "sent_to_payroll"])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ timecards: data });
}

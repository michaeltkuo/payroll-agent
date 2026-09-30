export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { reconcileFinalizedTimecardsForFrequencyChange } from "@/lib/pay-periods";

/**
 * POST /api/admin/employees/[id]/reconcile-history — one-time, explicitly
 * admin-triggered migration of an employee's approved/submitted timecards
 * into their CURRENT pay_frequency's periods. Deliberately separate from
 * PATCH /api/admin/employees/[id] (which only auto-reconciles in-progress
 * draft/rejected data) — finalized payroll history should only be touched
 * when an admin explicitly asks for it, not on every frequency change.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { data: employee, error } = await supabaseAdmin
    .from("users")
    .select("id, pay_frequency")
    .eq("id", id)
    .eq("role", "employee")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const reconciliation = await reconcileFinalizedTimecardsForFrequencyChange(
    supabaseAdmin,
    employee.id,
    employee.pay_frequency
  );

  return NextResponse.json({ reconciliation });
}

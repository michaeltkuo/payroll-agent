export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

const VALID_PAY_FREQUENCIES = ["weekly", "semi_monthly", "monthly"] as const;
type PayFrequency = (typeof VALID_PAY_FREQUENCIES)[number];

/** PATCH /api/admin/employees/[id] — update an employee's pay frequency */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await req.json()) as { pay_frequency?: string };

  if (!body.pay_frequency || !VALID_PAY_FREQUENCIES.includes(body.pay_frequency as PayFrequency)) {
    return NextResponse.json(
      { error: "pay_frequency must be one of: weekly, semi_monthly, monthly" },
      { status: 400 }
    );
  }

  const { data: employee, error } = await supabaseAdmin
    .from("users")
    .update({ pay_frequency: body.pay_frequency })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  return NextResponse.json({ employee });
}

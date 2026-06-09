export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

/** DELETE /api/admin/employees/[id]/rates/[rateId] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { rateId } = await params;

  const { error } = await supabaseAdmin
    .from("employee_rates")
    .delete()
    .eq("id", rateId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

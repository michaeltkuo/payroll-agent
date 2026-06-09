export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

/** GET /api/admin/employees/[id]/rates */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("employee_rates")
    .select("*")
    .eq("employee_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rates: data });
}

/** POST /api/admin/employees/[id]/rates — create a named rate */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await req.json()) as { label?: string; hourly_rate?: number; is_default?: boolean };

  if (!body.label || body.hourly_rate == null) {
    return NextResponse.json({ error: "label and hourly_rate are required" }, { status: 400 });
  }
  if (body.hourly_rate <= 0) {
    return NextResponse.json({ error: "hourly_rate must be positive" }, { status: 400 });
  }

  // Verify employee exists
  const { data: employee } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { data: rate, error } = await supabaseAdmin
    .from("employee_rates")
    .insert({
      employee_id: id,
      label: body.label,
      hourly_rate: body.hourly_rate,
      is_default: body.is_default ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rate }, { status: 201 });
}

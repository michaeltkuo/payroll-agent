export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

/** PATCH /api/timecard/entry/[id] — update an existing entry */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json()) as {
    clock_in?: string | null;
    clock_out?: string | null;
    notes?: string | null;
    rate_id?: string | null;
  };

  // Verify the entry belongs to this user's timecard
  const { data: entry } = await supabaseAdmin
    .from("time_entries")
    .select("id, timecard_id, timecard:timecards(employee_id, status)")
    .eq("id", id)
    .single();

  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const tc = (entry as unknown as { timecard: { employee_id: string; status: string } | null }).timecard;
  if (!tc) return NextResponse.json({ error: "Timecard not found" }, { status: 404 });

  // Verify ownership
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .maybeSingle();
  if (!user || tc.employee_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["draft", "rejected"].includes(tc.status)) {
    return NextResponse.json({ error: "Timecard is not editable in its current state" }, { status: 409 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("time_entries")
    .update({
      clock_in: body.clock_in ?? null,
      clock_out: body.clock_out ?? null,
      notes: body.notes ?? null,
      rate_id: body.rate_id ?? null,
    })
    .eq("id", id)
    .select("*, rate:employee_rates(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: updated });
}

/** DELETE /api/timecard/entry/[id] — delete a single entry */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify the entry belongs to this user's timecard
  const { data: entry } = await supabaseAdmin
    .from("time_entries")
    .select("id, timecard:timecards(employee_id, status)")
    .eq("id", id)
    .single();

  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const tc = (entry as unknown as { timecard: { employee_id: string; status: string } | null }).timecard;
  if (!tc) return NextResponse.json({ error: "Timecard not found" }, { status: 404 });

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .maybeSingle();
  if (!user || tc.employee_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["draft", "rejected"].includes(tc.status)) {
    return NextResponse.json({ error: "Timecard is not editable in its current state" }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from("time_entries")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

/** GET /api/admin/notifications — the authenticated admin's notifications, newest first (capped at 50) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: admin, error: adminError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .maybeSingle();

  if (adminError || !admin) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("recipient_user_id", admin.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count: unreadCount, error: countError } = await supabaseAdmin
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_user_id", admin.id)
    .is("read_at", null);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  const notifications = (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    timecardId: n.timecard_id,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));

  return NextResponse.json({ notifications, unreadCount: unreadCount ?? 0 });
}

/**
 * PATCH /api/admin/notifications
 * Body: { id: string } — mark one notification read
 *       { markAll: true } — mark all of the admin's unread notifications read
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: admin, error: adminError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .maybeSingle();

  if (adminError || !admin) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await req.json()) as { id?: string; markAll?: boolean };

  if (body.markAll) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_user_id", admin.id)
      .is("read_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id or markAll is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("recipient_user_id", admin.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import type { User, EmployeeRate } from "@/types";

export interface EmployeeWithRates extends User {
  rates: EmployeeRate[];
}

/** GET /api/admin/employees — all employees with their rate profiles */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*, rates:employee_rates(*)")
    .eq("role", "employee")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employees: data as EmployeeWithRates[] });
}

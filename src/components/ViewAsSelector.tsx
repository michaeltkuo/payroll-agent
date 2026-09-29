"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeWithRates } from "@/app/api/admin/employees/route";

/**
 * Admin-only "Viewing as:" dropdown, rendered in the root layout header.
 * Purely a quick-switch trigger — it navigates to /dashboard (optionally
 * with ?asEmployeeId=) and doesn't track current state itself; the
 * dashboard page's own "Viewing as {name}" banner is the source of truth
 * for whose timecard is on screen.
 */
export default function ViewAsSelector() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeWithRates[]>([]);

  useEffect(() => {
    fetch("/api/admin/employees")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { employees: EmployeeWithRates[] } | null) => {
        if (json) setEmployees(json.employees);
      })
      .catch(() => {});
  }, []);

  if (employees.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
      <span className="hidden sm:inline">Viewing as:</span>
      <select
        data-testid="view-as-select"
        defaultValue=""
        onChange={(e) => {
          const id = e.target.value;
          router.push(id ? `/dashboard?asEmployeeId=${id}` : "/dashboard");
        }}
        className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-2 py-1 text-gray-700 dark:text-gray-200"
      >
        <option value="">— Myself —</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name ?? employee.email}
          </option>
        ))}
      </select>
    </label>
  );
}

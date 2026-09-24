"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type { Timecard, PayFrequency } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────

interface PayrollRunTimecard {
  id: string;
  status: Timecard["status"];
  periodStart: string;
  periodEnd: string;
  totalHours: number;
}

interface PayrollRunEmployee {
  employeeId: string;
  name: string | null;
  payFrequency: PayFrequency;
  timecards: PayrollRunTimecard[];
}

interface PayrollRunData {
  runStart: string;
  runEnd: string;
  employees: PayrollRunEmployee[];
}

// ── Constants ──────────────────────────────────────────────────────────────

// Same palette as the main admin page / dashboard, so a given status always
// reads the same way across the app: draft = not yet submitted (gray),
// submitted = needs review (blue), approved = green, rejected = red,
// sent_to_payroll = purple.
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  sent_to_payroll: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft — not yet submitted",
  submitted: "Submitted — needs review",
  approved: "Approved",
  rejected: "Rejected",
  sent_to_payroll: "Sent to Payroll",
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  semi_monthly: "Semi-monthly",
  monthly: "Monthly",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── TimecardStatusRow ──────────────────────────────────────────────────────

interface TimecardStatusRowProps {
  tc: PayrollRunTimecard;
}

function TimecardStatusRow({ tc }: TimecardStatusRowProps) {
  const needsAction = tc.status === "submitted";

  const row = (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            STATUS_COLORS[tc.status] ?? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          }`}
          data-testid={`payroll-run-status-${tc.id}`}
        >
          {STATUS_LABELS[tc.status] ?? tc.status}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDate(tc.periodStart)} – {formatDate(tc.periodEnd)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">{tc.totalHours.toFixed(2)} hrs</span>
        {needsAction && (
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Review →</span>
        )}
      </div>
    </div>
  );

  if (!needsAction) return row;

  return (
    <Link
      href="/admin"
      className="block hover:opacity-80 transition-opacity"
      data-testid={`payroll-run-timecard-link-${tc.id}`}
    >
      {row}
    </Link>
  );
}

// ── EmployeeRunRow ─────────────────────────────────────────────────────────

interface EmployeeRunRowProps {
  employee: PayrollRunEmployee;
}

function EmployeeRunRow({ employee }: EmployeeRunRowProps) {
  return (
    <div
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm px-5 py-4"
      data-testid={`payroll-run-employee-${employee.employeeId}`}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium text-gray-900 dark:text-gray-100">{employee.name ?? "—"}</p>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {FREQUENCY_LABELS[employee.payFrequency] ?? employee.payFrequency}
        </span>
      </div>

      {employee.timecards.length === 0 ? (
        <div
          className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          data-testid={`payroll-run-status-none-${employee.employeeId}`}
        >
          Not yet submitted
        </div>
      ) : (
        <div className="space-y-2">
          {employee.timecards.map((tc) => (
            <TimecardStatusRow key={tc.id} tc={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── PayrollRunsPage (root) ─────────────────────────────────────────────────

export default function PayrollRunsPage() {
  const [date, setDate] = useState(todayStr);
  const [data, setData] = useState<PayrollRunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (d: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payroll-runs?date=${d}`, { signal: controller.signal });
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (res.ok) {
        const json = (await res.json()) as PayrollRunData;
        setData(json);
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Failed to load payroll run.");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError("Failed to load payroll run.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(date);
  }, [date, load]);

  if (forbidden) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">Access denied — admins only.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <Link href="/admin" className="text-sm text-indigo-600 hover:underline">
            ← Back to Admin
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">Payroll Runs</h1>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="payroll-run-date" className="text-sm text-gray-500 dark:text-gray-400">
            Date
          </label>
          <input
            id="payroll-run-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="payroll-run-date-picker"
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      </div>

      {error && (
        <p className="text-red-500 dark:text-red-400 mb-4" data-testid="payroll-run-error">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500">Loading…</p>
      ) : data ? (
        <>
          <h2
            className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-6"
            data-testid="payroll-run-heading"
          >
            Run window: {formatDate(data.runStart)} – {formatDate(data.runEnd)}
          </h2>

          {data.employees.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No employees found.</p>
          ) : (
            <div className="space-y-3" data-testid="payroll-run-employee-list">
              {data.employees.map((employee) => (
                <EmployeeRunRow key={employee.employeeId} employee={employee} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

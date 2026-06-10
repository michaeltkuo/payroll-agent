"use client";

import { useEffect, useState, useCallback } from "react";
import type { TimecardWithEntries, EmployeeRate } from "@/types";
import type { EmployeeWithRates } from "@/app/api/admin/employees/route";

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  sent_to_payroll: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  sent_to_payroll: "Sent to Payroll",
};

type Tab = "review" | "approved" | "users";

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function totalHoursForTimecard(tc: TimecardWithEntries) {
  return tc.entries.reduce((sum, e) => sum + (e.total_hours ?? 0), 0);
}

// ── RejectModal ────────────────────────────────────────────────────────────

interface RejectModalProps {
  timecardId: string;
  onClose: () => void;
  onRejected: () => void;
}

function RejectModal({ timecardId, onClose, onRejected }: RejectModalProps) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReject = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/timecards/${timecardId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejection_note: note }),
    });
    setLoading(false);
    if (res.ok) onRejected();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Reject Timecard</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Provide a reason so the employee can correct and resubmit.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Reason for rejection…"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <div className="mt-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TimecardCard ───────────────────────────────────────────────────────────

interface TimecardCardProps {
  tc: TimecardWithEntries;
  onAction?: () => void;
  readonly?: boolean;
}

function TimecardCard({ tc, onAction, readonly = false }: TimecardCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    const res = await fetch(`/api/admin/timecards/${tc.id}/approve`, { method: "POST" });
    setApproving(false);
    if (res.ok && onAction) onAction();
  };

  const total = totalHoursForTimecard(tc);

  return (
    <>
      {rejectOpen && (
        <RejectModal
          timecardId={tc.id}
          onClose={() => setRejectOpen(false)}
          onRejected={() => {
            setRejectOpen(false);
            if (onAction) onAction();
          }}
        />
      )}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-3">
            {tc.employee.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tc.employee.image}
                alt={tc.employee.name ?? ""}
                className="w-9 h-9 rounded-full object-cover"
              />
            )}
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{tc.employee.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(tc.pay_period.start_date)} – {formatDate(tc.pay_period.end_date)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">{total.toFixed(2)} hrs</span>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[tc.status] ?? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}
            >
              {STATUS_LABELS[tc.status] ?? tc.status}
            </span>
            <span className="text-gray-400 dark:text-gray-500 text-xs">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-gray-100 dark:border-gray-700/50 px-5 py-4">
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/50">
                  <th className="py-1.5 font-medium">Date</th>
                  <th className="py-1.5 font-medium">In</th>
                  <th className="py-1.5 font-medium">Out</th>
                  <th className="py-1.5 font-medium">Hours</th>
                  <th className="py-1.5 font-medium">Rate</th>
                  <th className="py-1.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {tc.entries
                  .slice()
                  .sort((a, b) => {
                    const dateDiff = a.work_date.localeCompare(b.work_date);
                    return dateDiff !== 0 ? dateDiff : (a.entry_order ?? 0) - (b.entry_order ?? 0);
                  })
                  .map((e, idx, arr) => {
                    const showDate = idx === 0 || arr[idx - 1].work_date !== e.work_date;
                    return (
                      <tr key={e.id} className="border-b border-gray-50 dark:border-gray-700/30 last:border-0">
                        <td className="py-1.5 text-gray-700 dark:text-gray-300">
                          {showDate
                            ? new Date(e.work_date + "T00:00:00").toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })
                            : ""}
                        </td>
                        <td className="py-1.5 text-gray-600 dark:text-gray-400">{e.clock_in?.slice(0, 5) ?? "—"}</td>
                        <td className="py-1.5 text-gray-600 dark:text-gray-400">{e.clock_out?.slice(0, 5) ?? "—"}</td>
                        <td className="py-1.5 text-gray-700 dark:text-gray-300">
                          {e.total_hours !== null ? Number(e.total_hours).toFixed(2) : "—"}
                        </td>
                        <td className="py-1.5 text-gray-600 dark:text-gray-400 text-xs">
                          {e.rate ? `${e.rate.label} ($${e.rate.hourly_rate}/hr)` : "—"}
                        </td>
                        <td className="py-1.5 text-gray-500 dark:text-gray-400 text-xs">{e.notes ?? ""}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            {tc.entries.some((e) => e.rate) && (() => {
              const breakdown = new Map<string, { label: string; hours: number; rate: number }>();
              for (const e of tc.entries) {
                if (!e.rate || !e.total_hours) continue;
                const key = e.rate.id;
                if (!breakdown.has(key)) breakdown.set(key, { label: e.rate.label, hours: 0, rate: e.rate.hourly_rate });
                breakdown.get(key)!.hours += Number(e.total_hours);
              }
              const total = Array.from(breakdown.values()).reduce((s, b) => s + b.hours * b.rate, 0);
              return (
                <div data-testid="admin-dollar-breakdown" className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm">
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Pay Breakdown</p>
                  {Array.from(breakdown.values()).map((b) => (
                    <div key={b.label} className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{b.label} — {b.hours.toFixed(2)} hrs × ${b.rate.toFixed(2)}/hr</span>
                      <span>${(b.hours * b.rate).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between font-semibold text-gray-800 dark:text-gray-200">
                    <span>Estimated Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            {tc.status === "rejected" && tc.rejection_note && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                <strong>Rejection note:</strong> {tc.rejection_note}
              </p>
            )}
            {!readonly && tc.status === "submitted" && (
              <div className="flex gap-3">
                <button onClick={handleApprove} disabled={approving}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {approving ? "Approving…" : "✓ Approve"}
                </button>
                <button onClick={() => setRejectOpen(true)}
                  className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                  ✕ Reject
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── EmployeeRateRow ────────────────────────────────────────────────────────

interface EmployeeRateRowProps {
  rate: EmployeeRate;
  onDeleted: () => void;
}

function EmployeeRateRow({ rate, onDeleted }: EmployeeRateRowProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete rate "${rate.label}"?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/employees/${rate.employee_id}/rates/${rate.id}`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (res.ok) onDeleted();
  };

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{rate.label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">${Number(rate.hourly_rate).toFixed(2)} / hr</p>
        </div>
        {rate.is_default && (
          <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs px-2 py-0.5">
            Default
          </span>
        )}
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        data-testid={`delete-rate-${rate.id}`}
        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40 text-base"
        title="Delete rate"
      >
        🗑
      </button>
    </div>
  );
}

// ── EmployeeCard ───────────────────────────────────────────────────────────

interface EmployeeCardProps {
  employee: EmployeeWithRates;
  onRatesChanged: () => void;
}

function EmployeeCard({ employee, onRatesChanged }: EmployeeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [label, setLabel] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);
    const rate = parseFloat(hourlyRate);
    if (!label.trim() || isNaN(rate) || rate <= 0) {
      setError("Label and a positive $/hr are required.");
      return;
    }
    setAdding(true);
    const res = await fetch(`/api/admin/employees/${employee.id}/rates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), hourly_rate: rate, is_default: isDefault }),
    });
    setAdding(false);
    if (res.ok) {
      setLabel("");
      setHourlyRate("");
      setIsDefault(false);
      onRatesChanged();
    } else {
      const json = await res.json() as { error?: string };
      setError(json.error ?? "Failed to add rate.");
    }
  };

  const initials = (employee.name ?? employee.email)
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`employee-row-${employee.id}`}
      >
        <div className="flex items-center gap-3">
          {employee.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={employee.image} alt={employee.name ?? ""} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">
              {initials}
            </div>
          )}
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{employee.name ?? "—"}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{employee.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {employee.rates.length} {employee.rates.length === 1 ? "rate" : "rates"}
          </span>
          <span className="text-gray-400 dark:text-gray-500 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
            Rate Profiles
          </p>

          {employee.rates.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4 italic">No rates configured yet.</p>
          ) : (
            <div className="space-y-2 mb-5">
              {employee.rates.map((r) => (
                <EmployeeRateRow key={r.id} rate={r} onDeleted={onRatesChanged} />
              ))}
            </div>
          )}

          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
            Add Rate
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Regular"
                data-testid={`rate-label-input-${employee.id}`}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 w-44 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">$/hr</label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                data-testid={`rate-amount-input-${employee.id}`}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 w-28 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                id={`default-${employee.id}`}
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded"
              />
              <label htmlFor={`default-${employee.id}`} className="text-xs text-gray-500 dark:text-gray-400">
                Set as default
              </label>
            </div>
            <button
              onClick={handleAdd}
              disabled={adding}
              data-testid={`add-rate-btn-${employee.id}`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {adding ? "Adding…" : "+ Add"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ── ManageUsersTab ─────────────────────────────────────────────────────────

interface ManageUsersTabProps {
  employees: EmployeeWithRates[];
  loading: boolean;
  onRatesChanged: () => void;
}

function ManageUsersTab({ employees, loading, onRatesChanged }: ManageUsersTabProps) {
  if (loading) return <p className="text-gray-400 dark:text-gray-500">Loading…</p>;
  if (employees.length === 0)
    return <p className="text-gray-500 dark:text-gray-400">No employees found.</p>;

  return (
    <div className="space-y-3" data-testid="manage-users-panel">
      {employees.map((emp) => (
        <EmployeeCard key={emp.id} employee={emp} onRatesChanged={onRatesChanged} />
      ))}
    </div>
  );
}

// ── AdminPage (root) ───────────────────────────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("review");
  const [timecards, setTimecards] = useState<TimecardWithEntries[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRates[]>([]);
  const [loadingTimecards, setLoadingTimecards] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const loadTimecards = useCallback(async () => {
    setLoadingTimecards(true);
    const res = await fetch("/api/admin/timecards");
    if (res.status === 403) {
      setForbidden(true);
      setLoadingTimecards(false);
      return;
    }
    if (res.ok) {
      const json = (await res.json()) as { timecards: TimecardWithEntries[] };
      setTimecards(json.timecards);
    }
    setLoadingTimecards(false);
  }, []);

  const loadEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    const res = await fetch("/api/admin/employees");
    if (res.ok) {
      const json = (await res.json()) as { employees: EmployeeWithRates[] };
      setEmployees(json.employees);
    }
    setLoadingEmployees(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTimecards();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEmployees();
  }, [loadTimecards, loadEmployees]);

  const handleRefresh = () => {
    loadTimecards();
    loadEmployees();
  };

  if (forbidden) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">Access denied — admins only.</p>
      </div>
    );
  }

  const toReview = timecards.filter((tc) => tc.status === "submitted");
  const approved = timecards.filter((tc) => tc.status === "approved" || tc.status === "sent_to_payroll");

  const TAB_CONFIG: { id: Tab; label: string; badge?: number }[] = [
    { id: "review", label: "To Review", badge: toReview.length || undefined },
    { id: "approved", label: "Approved" },
    { id: "users", label: "Manage Users" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin</h1>
        <button onClick={handleRefresh} className="text-sm text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-8" data-testid="admin-tabs">
        {TAB_CONFIG.map(({ id, label, badge }) => (
          <button
            key={id}
            data-testid={`tab-${id}`}
            onClick={() => setActiveTab(id)}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === id
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-b-2 border-indigo-500 -mb-px"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            }`}
          >
            {label}
            {badge != null && badge > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-600 text-white text-xs px-1.5 py-0.5">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === "review" && (
        <div data-testid="panel-review">
          {loadingTimecards ? (
            <p className="text-gray-400 dark:text-gray-500">Loading…</p>
          ) : toReview.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No timecards awaiting review.</p>
          ) : (
            <div className="space-y-3">
              {toReview.map((tc) => (
                <TimecardCard key={tc.id} tc={tc} onAction={loadTimecards} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "approved" && (
        <div data-testid="panel-approved">
          {loadingTimecards ? (
            <p className="text-gray-400 dark:text-gray-500">Loading…</p>
          ) : approved.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No approved timecards.</p>
          ) : (
            <div className="space-y-3">
              {approved.map((tc) => (
                <TimecardCard key={tc.id} tc={tc} readonly />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "users" && (
        <ManageUsersTab
          employees={employees}
          loading={loadingEmployees}
          onRatesChanged={loadEmployees}
        />
      )}
    </div>
  );
}

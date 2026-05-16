"use client";

import { useEffect, useState, useCallback } from "react";
import type { TimecardWithEntries } from "@/types";

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

interface TimecardCardProps {
  tc: TimecardWithEntries;
  onAction: () => void;
}

function TimecardCard({ tc, onAction }: TimecardCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    const res = await fetch(`/api/admin/timecards/${tc.id}/approve`, { method: "POST" });
    setApproving(false);
    if (res.ok) onAction();
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
            onAction();
          }}
        />
      )}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        {/* Card header */}
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

        {/* Expanded entries */}
        {expanded && (
          <div className="border-t border-gray-100 dark:border-gray-700/50 px-5 py-4">
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/50">
                  <th className="py-1.5 font-medium">Date</th>
                  <th className="py-1.5 font-medium">In</th>
                  <th className="py-1.5 font-medium">Out</th>
                  <th className="py-1.5 font-medium">Hours</th>
                  <th className="py-1.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {tc.entries
                  .slice()
                  .sort((a, b) => a.work_date.localeCompare(b.work_date))
                  .map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 dark:border-gray-700/30 last:border-0">
                      <td className="py-1.5 text-gray-700 dark:text-gray-300">
                        {new Date(e.work_date + "T00:00:00").toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-1.5 text-gray-600 dark:text-gray-400">{e.clock_in?.slice(0, 5) ?? "—"}</td>
                      <td className="py-1.5 text-gray-600 dark:text-gray-400">{e.clock_out?.slice(0, 5) ?? "—"}</td>
                      <td className="py-1.5 text-gray-700 dark:text-gray-300">
                        {e.total_hours !== null ? Number(e.total_hours).toFixed(2) : "—"}
                      </td>
                      <td className="py-1.5 text-gray-500 dark:text-gray-400 text-xs">{e.notes ?? ""}</td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {tc.status === "rejected" && tc.rejection_note && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                <strong>Rejection note:</strong> {tc.rejection_note}
              </p>
            )}

            {tc.status === "submitted" && (
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {approving ? "Approving…" : "✓ Approve"}
                </button>
                <button
                  onClick={() => setRejectOpen(true)}
                  className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
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

export default function AdminPage() {
  const [timecards, setTimecards] = useState<TimecardWithEntries[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/timecards");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (res.ok) {
      const json = (await res.json()) as { timecards: TimecardWithEntries[] };
      setTimecards(json.timecards);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (forbidden) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">Access denied — admins only.</p>
      </div>
    );
  }

  const groups: Record<string, TimecardWithEntries[]> = {
    submitted: [],
    approved: [],
    rejected: [],
    sent_to_payroll: [],
  };
  for (const tc of timecards) {
    if (groups[tc.status]) groups[tc.status].push(tc);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin — Timecards</h1>
        <button
          onClick={load}
          className="text-sm text-indigo-600 hover:underline"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500">Loading…</p>
      ) : timecards.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No timecards to review.</p>
      ) : (
        <div className="space-y-8">
          {(["submitted", "approved", "rejected", "sent_to_payroll"] as const).map((status) => {
            const group = groups[status];
            if (!group || group.length === 0) return null;
            return (
              <section key={status}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                  {STATUS_LABELS[status]} ({group.length})
                </h2>
                <div className="space-y-3">
                  {group.map((tc) => (
                    <TimecardCard key={tc.id} tc={tc} onAction={load} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { Timecard, TimeEntry, PayPeriod } from "@/types";
import { getWeekStart } from "@/lib/pay-periods";

interface DashboardData {
  timecard: Timecard;
  entries: TimeEntry[];
  pay_period: PayPeriod;
}

const STATUS_LABELS: Record<Timecard["status"], string> = {
  draft: "Draft",
  submitted: "Submitted — pending review",
  approved: "Approved",
  rejected: "Rejected",
  sent_to_payroll: "Sent to Payroll",
};

const STATUS_COLORS: Record<Timecard["status"], string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  sent_to_payroll: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
};

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatWeekLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function calcHours(clockIn: string, clockOut: string): number | null {
  if (!clockIn || !clockOut) return null;
  const [ih, im] = clockIn.split(":").map(Number);
  const [oh, om] = clockOut.split(":").map(Number);
  const diff = (oh * 60 + om - (ih * 60 + im)) / 60;
  return diff > 0 ? Math.round(diff * 100) / 100 : null;
}

function getDaysInPeriod(start: string, end: string): string[] {
  const days: string[] = [];
  const current = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  while (current <= endDate) {
    days.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export default function DashboardPage() {
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week, etc.
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState<
    Record<string, { clock_in: string; clock_out: string; notes: string }>
  >({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Compute the ISO date string for the Sunday of the displayed week
  const weekStartStr = useMemo(() => {
    const base = getWeekStart(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    return base.toISOString().slice(0, 10);
  }, [weekOffset]);

  const load = useCallback(async (week: string) => {
    setLoading(true);
    const res = await fetch(`/api/timecard?week=${week}`);
    if (res.ok) {
      const json = (await res.json()) as DashboardData;
      setData(json);
      const map: Record<string, { clock_in: string; clock_out: string; notes: string }> = {};
      for (const e of json.entries) {
        map[e.work_date] = {
          clock_in: e.clock_in ? e.clock_in.slice(0, 5) : "",
          clock_out: e.clock_out ? e.clock_out.slice(0, 5) : "",
          notes: e.notes ?? "",
        };
      }
      setLocalEntries(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(weekStartStr);
  }, [weekOffset, load]); // weekOffset drives weekStartStr; weekOffset change → reload

  const navigateWeek = (direction: -1 | 1) => {
    // Flush and clear any pending autosaves before switching weeks
    Object.values(saveTimers.current).forEach(clearTimeout);
    saveTimers.current = {};
    setLocalEntries({});
    setWeekOffset((prev) => prev + direction);
  };

  const isEditable =
    (data?.timecard.status === "draft" || data?.timecard.status === "rejected") &&
    data?.pay_period.status === "open";

  const saveEntry = useCallback(
    async (workDate: string, values: { clock_in: string; clock_out: string; notes: string }) => {
      await fetch("/api/timecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: weekStartStr,
          work_date: workDate,
          clock_in: values.clock_in || null,
          clock_out: values.clock_out || null,
          notes: values.notes || null,
        }),
      });
    },
    [weekStartStr]
  );

  const handleEntryChange = (
    workDate: string,
    field: "clock_in" | "clock_out" | "notes",
    value: string
  ) => {
    setLocalEntries((prev) => {
      const updated = {
        ...(prev[workDate] ?? { clock_in: "", clock_out: "", notes: "" }),
        [field]: value,
      };
      const newState = { ...prev, [workDate]: updated };

      if (saveTimers.current[workDate]) clearTimeout(saveTimers.current[workDate]);
      saveTimers.current[workDate] = setTimeout(() => {
        saveEntry(workDate, updated);
      }, 800);

      return newState;
    });
  };

  const handleBlur = (workDate: string) => {
    if (saveTimers.current[workDate]) {
      clearTimeout(saveTimers.current[workDate]);
      delete saveTimers.current[workDate];
    }
    const values = localEntries[workDate];
    if (values) saveEntry(workDate, values);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const res = await fetch("/api/timecard/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: weekStartStr }),
    });
    if (res.ok) {
      await load(weekStartStr);
    } else {
      const json = (await res.json()) as { error?: string };
      setSubmitError(json.error ?? "Failed to submit");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-gray-400 dark:text-gray-500">Loading timecard…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-red-500">Failed to load timecard. Please refresh.</span>
      </div>
    );
  }

  const { timecard, pay_period } = data;
  const days = getDaysInPeriod(pay_period.start_date, pay_period.end_date);

  const completedEntries = days.filter((d) => {
    const e = localEntries[d];
    return e?.clock_in && e?.clock_out;
  });

  const totalHours = days.reduce((sum, d) => {
    const e = localEntries[d];
    if (!e?.clock_in || !e?.clock_out) return sum;
    return sum + (calcHours(e.clock_in, e.clock_out) ?? 0);
  }, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Timecard</h1>
          {/* Week navigator */}
          <div className="flex items-center gap-1 mt-1">
            <button
              onClick={() => navigateWeek(-1)}
              className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
              aria-label="Previous week"
            >
              ←
            </button>
            <p
              data-testid="week-nav-label"
              className="text-sm text-gray-500 dark:text-gray-400 px-1 min-w-[200px] text-center"
            >
              {weekOffset === 0 && (
                <span className="font-medium text-indigo-600 dark:text-indigo-400 mr-1">
                  This week ·
                </span>
              )}
              {formatWeekLabel(pay_period.start_date)} – {formatWeekLabel(pay_period.end_date)}
            </p>
            <button
              onClick={() => navigateWeek(1)}
              disabled={weekOffset === 0}
              className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next week"
            >
              →
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[timecard.status]}`}
          >
            {STATUS_LABELS[timecard.status]}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Total: <strong>{totalHours.toFixed(2)} hrs</strong>
          </span>
        </div>
      </div>

      {/* Rejection note */}
      {timecard.status === "rejected" && timecard.rejection_note && (
        <div
          data-testid="rejection-banner"
          className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          <strong>Rejection reason:</strong> {timecard.rejection_note}
        </div>
      )}

      {/* Time entry table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left">
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-36">Date</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-32">Clock In</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-32">Clock Out</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-20">Hours</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Notes</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const entry = localEntries[day] ?? { clock_in: "", clock_out: "", notes: "" };
              const hours = calcHours(entry.clock_in, entry.clock_out);
              const dayDate = new Date(day + "T00:00:00");
              const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

              return (
                <tr
                  key={day}
                  className={`border-b border-gray-100 dark:border-gray-700/50 last:border-0 ${isWeekend ? "bg-gray-50/60 dark:bg-gray-800/40" : ""}`}
                >
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {formatDate(day)}
                  </td>
                  <td className="px-4 py-2">
                    {isEditable ? (
                      <input
                        type="time"
                        value={entry.clock_in}
                        onChange={(e) => handleEntryChange(day, "clock_in", e.target.value)}
                        onBlur={() => handleBlur(day)}
                        className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{entry.clock_in || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditable ? (
                      <input
                        type="time"
                        value={entry.clock_out}
                        onChange={(e) => handleEntryChange(day, "clock_out", e.target.value)}
                        onBlur={() => handleBlur(day)}
                        className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{entry.clock_out || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                    {hours !== null ? hours.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {isEditable ? (
                      <input
                        type="text"
                        placeholder="optional"
                        value={entry.notes}
                        onChange={(e) => handleEntryChange(day, "notes", e.target.value)}
                        onBlur={() => handleBlur(day)}
                        className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{entry.notes || ""}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Submit */}
      {isEditable && (
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || completedEntries.length === 0}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Timecard"}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {completedEntries.length} of {days.length} days have complete entries. Changes
            auto-save.
          </p>
          {submitError && (
            <p className="text-sm text-red-600">{submitError}</p>
          )}
        </div>
      )}
    </div>
  );
}

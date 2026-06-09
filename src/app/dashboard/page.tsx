"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { Timecard, TimeEntry, PayPeriod, EmployeeRate } from "@/types";
import { getWeekStart } from "@/lib/pay-periods";

interface EntryDraft {
  id: string | null;
  _tempKey: string;
  clock_in: string;
  clock_out: string;
  notes: string;
  rate_id: string | null;
}

interface DashboardData {
  timecard: Timecard;
  entries: TimeEntry[];
  pay_period: PayPeriod;
  rates: EmployeeRate[];
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

function entriesToDraftMap(entries: TimeEntry[]): Record<string, EntryDraft[]> {
  const map: Record<string, EntryDraft[]> = {};
  for (const e of entries) {
    if (!map[e.work_date]) map[e.work_date] = [];
    map[e.work_date].push({
      id: e.id,
      _tempKey: e.id,
      clock_in: e.clock_in ? e.clock_in.slice(0, 5) : "",
      clock_out: e.clock_out ? e.clock_out.slice(0, 5) : "",
      notes: e.notes ?? "",
      rate_id: e.rate_id ?? null,
    });
  }
  return map;
}

export default function DashboardPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState<Record<string, EntryDraft[]>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  const weekStartStr = useMemo(() => {
    const base = getWeekStart(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    return base.toISOString().slice(0, 10);
  }, [weekOffset]);

  const load = useCallback(async (week: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch(`/api/timecard?week=${week}`, { signal: controller.signal });
      if (res.ok) {
        const json = (await res.json()) as DashboardData;
        setData(json);
        setLocalEntries(entriesToDraftMap(json.entries));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(weekStartStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, load]);

  const navigateWeek = (direction: -1 | 1) => {
    Object.values(saveTimers.current).forEach(clearTimeout);
    saveTimers.current = {};
    setLocalEntries({});
    setWeekOffset((prev) => prev + direction);
  };

  const isEditable =
    (data?.timecard.status === "draft" || data?.timecard.status === "rejected") &&
    data?.pay_period.status !== "closed";

  const patchEntry = useCallback(async (entryId: string, values: Partial<EntryDraft>) => {
    await fetch(`/api/timecard/entry/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clock_in: values.clock_in || null,
        clock_out: values.clock_out || null,
        notes: values.notes || null,
        rate_id: values.rate_id ?? null,
      }),
    });
  }, []);

  const handleFieldChange = (
    day: string,
    tempKey: string,
    field: keyof Pick<EntryDraft, "clock_in" | "clock_out" | "notes" | "rate_id">,
    value: string | null
  ) => {
    setLocalEntries((prev) => {
      const dayEntries = prev[day] ?? [];
      const updated = dayEntries.map((e) =>
        e._tempKey === tempKey ? { ...e, [field]: value } : e
      );
      const timerKey = `${day}-${tempKey}-${field}`;
      if (saveTimers.current[timerKey]) clearTimeout(saveTimers.current[timerKey]);
      const draft = updated.find((e) => e._tempKey === tempKey);
      if (draft?.id) {
        saveTimers.current[timerKey] = setTimeout(() => {
          patchEntry(draft.id!, draft);
        }, 800);
      }
      return { ...prev, [day]: updated };
    });
  };

  const handleBlur = (day: string, tempKey: string) => {
    const draft = (localEntries[day] ?? []).find((e) => e._tempKey === tempKey);
    if (!draft?.id) return;
    const timerKeys = Object.keys(saveTimers.current).filter((k) => k.startsWith(`${day}-${tempKey}`));
    for (const k of timerKeys) {
      clearTimeout(saveTimers.current[k]);
      delete saveTimers.current[k];
    }
    patchEntry(draft.id, draft);
  };

  const handleAddEntry = async (day: string) => {
    if (!data) return;
    const res = await fetch("/api/timecard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: weekStartStr, work_date: day }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as { entry: TimeEntry };
    const draft: EntryDraft = {
      id: json.entry.id,
      _tempKey: json.entry.id,
      clock_in: "",
      clock_out: "",
      notes: "",
      rate_id: null,
    };
    setLocalEntries((prev) => ({
      ...prev,
      [day]: [...(prev[day] ?? []), draft],
    }));
  };

  const handleDeleteEntry = async (day: string, tempKey: string) => {
    const draft = (localEntries[day] ?? []).find((e) => e._tempKey === tempKey);
    if (!draft?.id) {
      setLocalEntries((prev) => ({
        ...prev,
        [day]: (prev[day] ?? []).filter((e) => e._tempKey !== tempKey),
      }));
      return;
    }
    const res = await fetch(`/api/timecard/entry/${draft.id}`, { method: "DELETE" });
    if (res.ok) {
      setLocalEntries((prev) => ({
        ...prev,
        [day]: (prev[day] ?? []).filter((e) => e._tempKey !== tempKey),
      }));
    }
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

  const { timecard, pay_period, rates } = data;
  const days = getDaysInPeriod(pay_period.start_date, pay_period.end_date);

  const totalHours = Object.values(localEntries)
    .flat()
    .reduce((sum, e) => sum + (calcHours(e.clock_in, e.clock_out) ?? 0), 0);

  const rateMap = new Map(rates.map((r) => [r.id, r]));
  const dollarBreakdown: Map<string, { label: string; hours: number; rate: number }> = new Map();
  for (const e of Object.values(localEntries).flat()) {
    const hrs = calcHours(e.clock_in, e.clock_out);
    if (!hrs) continue;
    const key = e.rate_id ?? "__none__";
    if (!dollarBreakdown.has(key)) {
      const r = e.rate_id ? rateMap.get(e.rate_id) : null;
      dollarBreakdown.set(key, { label: r?.label ?? "No rate", hours: 0, rate: r?.hourly_rate ?? 0 });
    }
    dollarBreakdown.get(key)!.hours += hrs;
  }
  const totalDollars = Array.from(dollarBreakdown.values()).reduce(
    (sum, b) => sum + b.hours * b.rate,
    0
  );

  const completedEntryCount = Object.values(localEntries)
    .flat()
    .filter((e) => e.clock_in && e.clock_out).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Timecard</h1>
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
            Total: <strong data-testid="total-hours">{totalHours.toFixed(2)} hrs</strong>
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
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-28">Clock In</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-28">Clock Out</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-16">Hours</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-36">Rate</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Notes</th>
              {isEditable && <th className="px-4 py-3 w-8" />}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const dayEntries = localEntries[day] ?? [];
              const isWeekend =
                new Date(day + "T00:00:00").getDay() === 0 ||
                new Date(day + "T00:00:00").getDay() === 6;
              const rowClass = `border-b border-gray-100 dark:border-gray-700/50 last:border-0 ${isWeekend ? "bg-gray-50/60 dark:bg-gray-800/40" : ""}`;

              if (dayEntries.length === 0) {
                return (
                  <tr key={day} className={rowClass}>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatDate(day)}
                    </td>
                    <td className="px-4 py-2 text-gray-400 dark:text-gray-500">—</td>
                    <td className="px-4 py-2 text-gray-400 dark:text-gray-500">—</td>
                    <td className="px-4 py-2 text-gray-400 dark:text-gray-500">—</td>
                    <td className="px-4 py-2 text-gray-400 dark:text-gray-500">—</td>
                    <td className="px-4 py-2" />
                    {isEditable && (
                      <td className="px-4 py-2">
                        <button
                          data-testid={`add-entry-${day}`}
                          onClick={() => handleAddEntry(day)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                        >
                          + Add
                        </button>
                      </td>
                    )}
                  </tr>
                );
              }

              return dayEntries.map((entry, idx) => (
                <tr key={entry._tempKey} className={rowClass}>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {idx === 0 ? formatDate(day) : ""}
                  </td>
                  <td className="px-4 py-2">
                    {isEditable ? (
                      <input
                        type="time"
                        data-testid={`clock-in-${entry._tempKey}`}
                        value={entry.clock_in}
                        onChange={(e) => handleFieldChange(day, entry._tempKey, "clock_in", e.target.value)}
                        onBlur={() => handleBlur(day, entry._tempKey)}
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
                        data-testid={`clock-out-${entry._tempKey}`}
                        value={entry.clock_out}
                        onChange={(e) => handleFieldChange(day, entry._tempKey, "clock_out", e.target.value)}
                        onBlur={() => handleBlur(day, entry._tempKey)}
                        className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{entry.clock_out || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                    {calcHours(entry.clock_in, entry.clock_out)?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {isEditable ? (
                      <select
                        data-testid={`rate-select-${entry._tempKey}`}
                        value={entry.rate_id ?? ""}
                        onChange={(e) => handleFieldChange(day, entry._tempKey, "rate_id", e.target.value || null)}
                        onBlur={() => handleBlur(day, entry._tempKey)}
                        className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        <option value="">— select rate —</option>
                        {rates.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label} (${r.hourly_rate}/hr)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400 text-xs">
                        {entry.rate_id ? (rateMap.get(entry.rate_id)?.label ?? "—") : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditable ? (
                      <input
                        type="text"
                        placeholder="optional"
                        data-testid={`notes-${entry._tempKey}`}
                        value={entry.notes}
                        onChange={(e) => handleFieldChange(day, entry._tempKey, "notes", e.target.value)}
                        onBlur={() => handleBlur(day, entry._tempKey)}
                        className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{entry.notes || ""}</span>
                    )}
                  </td>
                  {isEditable && (
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        {idx === dayEntries.length - 1 && (
                          <button
                            data-testid={`add-entry-${day}`}
                            onClick={() => handleAddEntry(day)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                          >
                            + Add
                          </button>
                        )}
                        <button
                          data-testid={`delete-entry-${entry._tempKey}`}
                          onClick={() => handleDeleteEntry(day, entry._tempKey)}
                          className="text-xs text-red-500 dark:text-red-400 hover:underline"
                          aria-label="Remove entry"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {/* Dollar breakdown summary */}
      {dollarBreakdown.size > 0 && (
        <div
          data-testid="dollar-breakdown"
          className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm px-5 py-4"
        >
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Pay Summary</h3>
          <div className="space-y-1">
            {Array.from(dollarBreakdown.entries()).map(([key, b]) => (
              <div key={key} className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>
                  {b.label} — {b.hours.toFixed(2)} hrs × ${b.rate.toFixed(2)}/hr
                </span>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  ${(b.hours * b.rate).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Estimated Total
            </span>
            <span
              data-testid="dollar-total"
              className="text-sm font-bold text-green-700 dark:text-green-400"
            >
              ${totalDollars.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Submit */}
      {isEditable && (
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || completedEntryCount === 0}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Timecard"}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {completedEntryCount} complete {completedEntryCount === 1 ? "entry" : "entries"} across all days. Changes auto-save.
          </p>
          {submitError && (
            <p className="text-sm text-red-600">{submitError}</p>
          )}
        </div>
      )}
    </div>
  );
}

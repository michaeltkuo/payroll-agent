"use client";

import type { EmployeeRate } from "@/types";

export interface EntryDraft {
  id: string | null;
  _tempKey: string;
  clock_in: string;
  clock_out: string;
  notes: string;
  rate_id: string | null;
}

export type EntryDraftField = keyof Pick<
  EntryDraft,
  "clock_in" | "clock_out" | "notes" | "rate_id"
>;

/** Hours between two "HH:MM" strings, or null if either is missing/invalid (non-positive diff). */
export function calcHours(clockIn: string, clockOut: string): number | null {
  if (!clockIn || !clockOut) return null;
  const [ih, im] = clockIn.split(":").map(Number);
  const [oh, om] = clockOut.split(":").map(Number);
  const diff = (oh * 60 + om - (ih * 60 + im)) / 60;
  return diff > 0 ? Math.round(diff * 100) / 100 : null;
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface TimecardEntryTableProps {
  /** Every calendar date (YYYY-MM-DD) in the period to render, in order — 7 for a weekly period, up to 16 for semi-monthly. */
  days: string[];
  localEntries: Record<string, EntryDraft[]>;
  rates: EmployeeRate[];
  isEditable: boolean;
  onFieldChange: (
    day: string,
    tempKey: string,
    field: EntryDraftField,
    value: string | null
  ) => void;
  onBlur: (day: string, tempKey: string) => void;
  onAddEntry: (day: string) => void;
  onDeleteEntry: (day: string, tempKey: string) => void;
}

/**
 * Renders one row (or one row per entry, for days with multiple entries) per date in `days`,
 * with editable clock-in/clock-out/rate/notes inputs (debounced auto-save is the caller's
 * responsibility via onFieldChange/onBlur) when `isEditable`, and an add/remove control per row.
 * Shared by the weekly and semi-monthly dashboard views — `days` is the only thing that varies.
 */
export default function TimecardEntryTable({
  days,
  localEntries,
  rates,
  isEditable,
  onFieldChange,
  onBlur,
  onAddEntry,
  onDeleteEntry,
}: TimecardEntryTableProps) {
  const rateMap = new Map(rates.map((r) => [r.id, r]));

  return (
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
                        onClick={() => onAddEntry(day)}
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
                      onChange={(e) => onFieldChange(day, entry._tempKey, "clock_in", e.target.value)}
                      onBlur={() => onBlur(day, entry._tempKey)}
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
                      onChange={(e) => onFieldChange(day, entry._tempKey, "clock_out", e.target.value)}
                      onBlur={() => onBlur(day, entry._tempKey)}
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
                      onChange={(e) => onFieldChange(day, entry._tempKey, "rate_id", e.target.value || null)}
                      onBlur={() => onBlur(day, entry._tempKey)}
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
                      onChange={(e) => onFieldChange(day, entry._tempKey, "notes", e.target.value)}
                      onBlur={() => onBlur(day, entry._tempKey)}
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
                          onClick={() => onAddEntry(day)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                        >
                          + Add
                        </button>
                      )}
                      <button
                        data-testid={`delete-entry-${entry._tempKey}`}
                        onClick={() => onDeleteEntry(day, entry._tempKey)}
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
  );
}

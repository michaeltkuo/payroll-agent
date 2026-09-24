/**
 * Fixture payloads returned by mocked API calls.
 * Dates are computed dynamically based on the real current date so that
 * the fixtures always match what the app computes from `new Date()`.
 */

function toLocalDateStr(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function computeWeekStart(offsetWeeks = 0): string {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - d.getDay() + offsetWeeks * 7);
  return toLocalDateStr(d);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}

function fmtLabel(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtLabelWithYear(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Last calendar day of the month containing `date`. */
function lastDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * The semi-monthly (1st–15th, or 16th–end-of-month) window containing `date`.
 * Mirrors src/lib/pay-periods.ts#getSemiMonthlyPeriod so fixtures always line
 * up with what the app itself would compute for "today".
 */
function computeSemiMonthlyPeriod(date: Date): { start: string; end: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (date.getDate() <= 15) {
    return {
      start: toLocalDateStr(new Date(year, month, 1)),
      end: toLocalDateStr(new Date(year, month, 15)),
    };
  }
  return {
    start: toLocalDateStr(new Date(year, month, 16)),
    end: toLocalDateStr(new Date(year, month, lastDayOfMonth(date))),
  };
}

export const CURRENT_WEEK_START = computeWeekStart(0);
export const CURRENT_WEEK_END = addDays(CURRENT_WEEK_START, 6);
export const PREV_WEEK_START = computeWeekStart(-1);
export const PREV_WEEK_END = addDays(PREV_WEEK_START, 6);

// Weekday helpers (for assertions)
export const CURRENT_WEEK_MONDAY = addDays(CURRENT_WEEK_START, 1);
export const PREV_WEEK_MONDAY = addDays(PREV_WEEK_START, 1);

// Human-readable label strings as the dashboard renders them
export const CURRENT_WEEK_LABEL = `${fmtLabel(CURRENT_WEEK_START)} – ${fmtLabel(CURRENT_WEEK_END)}`;
export const PREV_WEEK_LABEL = `${fmtLabel(PREV_WEEK_START)} – ${fmtLabel(PREV_WEEK_END)}`;

export const mockPayPeriodCurrent = {
  id: "pp-current",
  start_date: CURRENT_WEEK_START,
  end_date: CURRENT_WEEK_END,
  status: "open",
  created_at: CURRENT_WEEK_START + "T00:00:00Z",
};

export const mockPayPeriodPrev = {
  id: "pp-prev",
  start_date: PREV_WEEK_START,
  end_date: PREV_WEEK_END,
  status: "open",
  created_at: PREV_WEEK_START + "T00:00:00Z",
};

export const mockTimecardDraft = {
  id: "tc-draft",
  employee_id: "user-uuid",
  pay_period_id: "pp-current",
  status: "draft",
  rejection_note: null,
  submitted_at: null,
  approved_at: null,
  created_at: CURRENT_WEEK_START + "T00:00:00Z",
};

export const mockTimecardSubmitted = {
  ...mockTimecardDraft,
  id: "tc-submitted",
  status: "submitted",
  submitted_at: CURRENT_WEEK_START + "T09:00:00Z",
};

export const mockTimecardApproved = {
  ...mockTimecardDraft,
  id: "tc-approved",
  status: "approved",
  approved_at: addDays(CURRENT_WEEK_START, 1) + "T10:00:00Z",
};

export const mockTimecardRejected = {
  ...mockTimecardDraft,
  id: "tc-rejected",
  status: "rejected",
  rejection_note: "Missing Saturday entry",
};

export const mockEntriesComplete = [
  { id: "e1", timecard_id: "tc-draft", work_date: addDays(CURRENT_WEEK_START, 1), clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
  { id: "e2", timecard_id: "tc-draft", work_date: addDays(CURRENT_WEEK_START, 2), clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
  { id: "e3", timecard_id: "tc-draft", work_date: addDays(CURRENT_WEEK_START, 3), clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
  { id: "e4", timecard_id: "tc-draft", work_date: addDays(CURRENT_WEEK_START, 4), clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
  { id: "e5", timecard_id: "tc-draft", work_date: addDays(CURRENT_WEEK_START, 5), clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
];

/** Build a full GET /api/timecard response body */
export function timecardResponse(
  timecard: Record<string, unknown>,
  pay_period: Record<string, unknown>,
  entries: Record<string, unknown>[] = [],
  rates: Record<string, unknown>[] = []
) {
  return { timecard, entries, pay_period, rates };
}

export const mockRatesStandard = [
  { id: "rate-1", employee_id: "user-uuid", label: "Standard", hourly_rate: 50, is_default: true, created_at: "" },
  { id: "rate-2", employee_id: "user-uuid", label: "Events", hourly_rate: 75, is_default: false, created_at: "" },
];

// ── Semi-monthly fixtures ────────────────────────────────────────────────
// Semi-monthly periods are contiguous (1st–15th, 16th–end-of-month), so the
// day before CURRENT_SEMI_START is always PREV_SEMI_END, and the day after
// PREV_SEMI_END is always CURRENT_SEMI_START. Dashboard navigation sends
// exactly those boundary dates as the `week` param (see navigatePeriod in
// src/app/dashboard/page.tsx), which is what the *_REF_DATE exports below
// capture for use as mock route keys.

const _currentSemi = computeSemiMonthlyPeriod(new Date());
export const CURRENT_SEMI_START = _currentSemi.start;
export const CURRENT_SEMI_END = _currentSemi.end;

const _prevSemi = computeSemiMonthlyPeriod(new Date(addDays(CURRENT_SEMI_START, -1) + "T00:00:00"));
export const PREV_SEMI_START = _prevSemi.start;
export const PREV_SEMI_END = _prevSemi.end;

/** The `week` value navigatePeriod(-1) sends when moving from the current period to the previous one. */
export const SEMI_PREV_NAV_REF_DATE = addDays(CURRENT_SEMI_START, -1); // === PREV_SEMI_END
/** The `week` value navigatePeriod(1) sends when moving from the previous period back to the current one. */
export const SEMI_NEXT_NAV_REF_DATE = addDays(PREV_SEMI_END, 1); // === CURRENT_SEMI_START

export const CURRENT_SEMI_LABEL = `${fmtLabel(CURRENT_SEMI_START)} – ${fmtLabelWithYear(CURRENT_SEMI_END)}`;
export const PREV_SEMI_LABEL = `${fmtLabel(PREV_SEMI_START)} – ${fmtLabelWithYear(PREV_SEMI_END)}`;

export const mockPayPeriodCurrentSemi = {
  id: "pp-current-semi",
  start_date: CURRENT_SEMI_START,
  end_date: CURRENT_SEMI_END,
  status: "open",
  created_at: CURRENT_SEMI_START + "T00:00:00Z",
};

export const mockPayPeriodPrevSemi = {
  id: "pp-prev-semi",
  start_date: PREV_SEMI_START,
  end_date: PREV_SEMI_END,
  status: "open",
  created_at: PREV_SEMI_START + "T00:00:00Z",
};

export const mockTimecardDraftSemi = {
  id: "tc-draft-semi",
  employee_id: "user-uuid",
  pay_period_id: "pp-current-semi",
  status: "draft",
  rejection_note: null,
  submitted_at: null,
  approved_at: null,
  created_at: CURRENT_SEMI_START + "T00:00:00Z",
};

/** Build a full GET /api/timecard response body for a semi-monthly employee. */
export function semiMonthlyTimecardResponse(
  timecard: Record<string, unknown>,
  pay_period: Record<string, unknown>,
  entries: Record<string, unknown>[] = [],
  rates: Record<string, unknown>[] = []
) {
  return { ...timecardResponse(timecard, pay_period, entries, rates), pay_frequency: "semi_monthly" };
}

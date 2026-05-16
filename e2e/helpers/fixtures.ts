/**
 * Fixture payloads returned by mocked API calls.
 * Dates are computed dynamically based on the real current date so that
 * the fixtures always match what the app computes from `new Date()`.
 */

function computeWeekStart(offsetWeeks = 0): string {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - d.getDay() + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtLabel(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export const CURRENT_WEEK_START = computeWeekStart(0);
export const CURRENT_WEEK_END = addDays(CURRENT_WEEK_START, 6);
export const PREV_WEEK_START = computeWeekStart(-1);
export const PREV_WEEK_END = addDays(PREV_WEEK_START, 6);

// Weekday helpers (for assertions)
export const CURRENT_WEEK_MONDAY = addDays(CURRENT_WEEK_START, 1);

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
  entries: Record<string, unknown>[] = []
) {
  return { timecard, entries, pay_period };
}

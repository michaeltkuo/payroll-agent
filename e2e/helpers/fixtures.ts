/**
 * Fixture payloads returned by mocked API calls.
 * Dates are relative to a fixed reference week: 2025-05-11 (Sun) – 2025-05-17 (Sat).
 */

export const CURRENT_WEEK_START = "2025-05-11";
export const CURRENT_WEEK_END = "2025-05-17";
export const PREV_WEEK_START = "2025-05-04";
export const PREV_WEEK_END = "2025-05-10";

export const mockPayPeriodCurrent = {
  id: "pp-current",
  start_date: CURRENT_WEEK_START,
  end_date: CURRENT_WEEK_END,
  status: "open",
  created_at: "2025-05-11T00:00:00Z",
};

export const mockPayPeriodPrev = {
  id: "pp-prev",
  start_date: PREV_WEEK_START,
  end_date: PREV_WEEK_END,
  status: "open",
  created_at: "2025-05-04T00:00:00Z",
};

export const mockTimecardDraft = {
  id: "tc-draft",
  employee_id: "user-uuid",
  pay_period_id: "pp-current",
  status: "draft",
  rejection_note: null,
  submitted_at: null,
  approved_at: null,
  created_at: "2025-05-11T00:00:00Z",
};

export const mockTimecardSubmitted = {
  ...mockTimecardDraft,
  id: "tc-submitted",
  status: "submitted",
  submitted_at: "2025-05-11T09:00:00Z",
};

export const mockTimecardApproved = {
  ...mockTimecardDraft,
  id: "tc-approved",
  status: "approved",
  approved_at: "2025-05-12T10:00:00Z",
};

export const mockTimecardRejected = {
  ...mockTimecardDraft,
  id: "tc-rejected",
  status: "rejected",
  rejection_note: "Missing Saturday entry",
};

export const mockEntriesComplete = [
  { id: "e1", timecard_id: "tc-draft", work_date: "2025-05-12", clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
  { id: "e2", timecard_id: "tc-draft", work_date: "2025-05-13", clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
  { id: "e3", timecard_id: "tc-draft", work_date: "2025-05-14", clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
  { id: "e4", timecard_id: "tc-draft", work_date: "2025-05-15", clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
  { id: "e5", timecard_id: "tc-draft", work_date: "2025-05-16", clock_in: "09:00:00", clock_out: "17:00:00", total_hours: 8, notes: null, created_at: "" },
];

/** Build a full GET /api/timecard response body */
export function timecardResponse(
  timecard: Record<string, unknown>,
  pay_period: Record<string, unknown>,
  entries: Record<string, unknown>[] = []
) {
  return { timecard, entries, pay_period };
}

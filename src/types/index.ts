export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: "employee" | "admin";
  employee_number: string | null;
  created_at: string;
}

export interface EmployeeRate {
  id: string;
  employee_id: string;
  label: string;
  hourly_rate: number;
  is_default: boolean;
  created_at: string;
}

export interface PayPeriod {
  id: string;
  start_date: string; // ISO date string YYYY-MM-DD
  end_date: string;
  status: "open" | "closed";
  created_at: string;
}

export interface Timecard {
  id: string;
  employee_id: string;
  pay_period_id: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "sent_to_payroll";
  rejection_note: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  timecard_id: string;
  work_date: string; // YYYY-MM-DD
  clock_in: string | null; // HH:MM:SS
  clock_out: string | null;
  total_hours: number | null;
  notes: string | null;
  rate_id: string | null;
  rate?: EmployeeRate | null;
  entry_order: number;
  created_at: string;
}

export interface PayrollSubmission {
  id: string;
  timecard_id: string;
  status: "pending" | "success" | "failed";
  error_message: string | null;
  attempted_at: string;
}

export interface TimecardWithEntries extends Timecard {
  entries: TimeEntry[];
  employee: User;
  pay_period: PayPeriod;
}

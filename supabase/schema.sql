-- Users
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  image text,
  role text not null default 'employee', -- 'employee' | 'admin'
  employee_number text,
  created_at timestamptz default now()
);

-- Named hourly rate profiles per employee (admin-managed)
create table if not exists employee_rates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references users(id) on delete cascade not null,
  label text not null,
  hourly_rate numeric(8,2) not null,
  is_default boolean not null default false,
  created_at timestamptz default now()
);

-- Pay periods (weekly, Sun–Sat)
create table if not exists pay_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  status text not null default 'open', -- 'open' | 'closed'
  created_at timestamptz default now()
);

-- Timecards (one per employee per pay period)
create table if not exists timecards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references users(id) not null,
  pay_period_id uuid references pay_periods(id) not null,
  status text not null default 'draft', -- 'draft' | 'submitted' | 'approved' | 'rejected' | 'sent_to_payroll'
  rejection_note text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now(),
  unique(employee_id, pay_period_id)
);

-- Time entries (clock-in/out; multiple allowed per day)
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  timecard_id uuid references timecards(id) on delete cascade not null,
  work_date date not null,
  clock_in time,
  clock_out time,
  total_hours numeric(4,2) generated always as (
    case when clock_in is not null and clock_out is not null
    then round(extract(epoch from (clock_out - clock_in)) / 3600.0, 2)
    else null end
  ) stored,
  notes text,
  rate_id uuid references employee_rates(id) on delete set null,
  entry_order int not null default 0,
  created_at timestamptz default now()
);

-- Payroll submissions log
create table if not exists payroll_submissions (
  id uuid primary key default gen_random_uuid(),
  timecard_id uuid references timecards(id) not null,
  status text not null default 'pending', -- 'pending' | 'success' | 'failed'
  error_message text,
  attempted_at timestamptz default now()
);

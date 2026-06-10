-- Migration 001: Add employee_rates table and multi-entry support
--
-- Applied to production: 2026-06-09
-- Context: Added named hourly rate profiles per employee (admin-managed)
--          and removed the one-entry-per-day constraint so employees can
--          log multiple sessions per date (e.g. regular hours + event hours).
--
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards.

-- 1. Named hourly rate profiles per employee (admin-managed)
CREATE TABLE IF NOT EXISTS employee_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  hourly_rate numeric(8,2) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Add rate association and ordering to time_entries
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS rate_id uuid REFERENCES employee_rates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entry_order int NOT NULL DEFAULT 0;

-- 3. Remove the one-entry-per-day unique constraint
ALTER TABLE time_entries
  DROP CONSTRAINT IF EXISTS time_entries_timecard_id_work_date_key;

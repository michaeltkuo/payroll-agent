-- Migration 002: Add per-employee pay frequency and notifications
--
-- Context: Pay periods are no longer global-weekly-only. Each employee has
--          a pay_frequency ('weekly' | 'semi_monthly' | 'monthly'), and
--          pay_periods rows are tagged with the frequency they were
--          generated for so a given start/end window can coexist across
--          frequencies. A notifications table supports in-app alerts
--          (e.g. timecard approved/rejected).
--
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards, and
-- constraints are dropped and re-added rather than added unconditionally.

-- 1. Per-employee pay frequency
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pay_frequency text NOT NULL DEFAULT 'weekly';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_pay_frequency_check;

ALTER TABLE users
  ADD CONSTRAINT users_pay_frequency_check
  CHECK (pay_frequency IN ('weekly', 'semi_monthly', 'monthly'));

-- 2. Pay period frequency tag (which cadence a given period row belongs to)
ALTER TABLE pay_periods
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'weekly';

ALTER TABLE pay_periods
  DROP CONSTRAINT IF EXISTS pay_periods_frequency_check;

ALTER TABLE pay_periods
  ADD CONSTRAINT pay_periods_frequency_check
  CHECK (frequency IN ('weekly', 'semi_monthly', 'monthly'));

-- 3. Notifications (in-app alerts tied to a timecard, e.g. approved/rejected)
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES users(id) NOT NULL,
  type text NOT NULL,
  timecard_id uuid REFERENCES timecards(id) ON DELETE CASCADE NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

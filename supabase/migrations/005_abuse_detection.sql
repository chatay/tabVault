-- Abuse detection infrastructure for AI categorization feature.
-- Adds a permanent block flag to profiles and a table for logging
-- flagged/blocked events for owner review.

-- 1. Block flag on existing profiles table
ALTER TABLE profiles
ADD COLUMN ai_blocked boolean DEFAULT false;

-- 2. New table to log all flagged and blocked users
CREATE TABLE abuse_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  saves_in_last_2_minutes integer,
  status text CHECK (status IN ('flagged', 'blocked')),
  triggered_at timestamp DEFAULT now(),
  reviewed boolean DEFAULT false
);

-- Index for quick lookups by user and review status
CREATE INDEX idx_abuse_flags_user_id ON abuse_flags(user_id);
CREATE INDEX idx_abuse_flags_unreviewed ON abuse_flags(reviewed) WHERE reviewed = false;

-- Add AI categorization fields to tab_groups.
-- All three are text because they store encrypted blobs, not raw JSON.
ALTER TABLE tab_groups
  ADD COLUMN sub_groups text DEFAULT NULL,
  ADD COLUMN summary text DEFAULT NULL,
  ADD COLUMN tags text DEFAULT NULL;

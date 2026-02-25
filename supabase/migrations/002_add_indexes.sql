-- Migration 002: Add indexes for common query patterns
-- These indexes improve performance for foreign key lookups and filtered queries.

CREATE INDEX idx_tabs_group_id ON tabs(group_id);
CREATE INDEX idx_tab_groups_user_id ON tab_groups(user_id);
CREATE INDEX idx_devices_user_id ON devices(user_id);

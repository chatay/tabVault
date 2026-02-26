-- Reliable tab count recalculation function.
-- Instead of relying solely on AFTER INSERT/DELETE triggers (which can fail
-- during CASCADE deletes), call this after every tab-changing operation
-- to ensure profiles.tab_count is always accurate.

CREATE OR REPLACE FUNCTION recalculate_tab_count(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE profiles SET tab_count = (
    SELECT COUNT(*) FROM tabs t
    JOIN tab_groups tg ON t.group_id = tg.id
    WHERE tg.user_id = p_user_id
  ) WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

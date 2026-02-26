-- Migration 003: Enforce tab limit at database level
-- A BEFORE INSERT trigger on tabs that rejects inserts when the user's
-- tab count has reached their tier limit. This is the real enforcement —
-- client-side checks are just UX hints.

-- Tier limits (must match constants.ts TIER_LIMITS)
-- cloud_free  = 75
-- cloud_paid  = unlimited
-- local_only  = n/a (never hits Supabase)

CREATE OR REPLACE FUNCTION enforce_tab_limit()
RETURNS TRIGGER AS $$
DECLARE
    _user_id UUID;
    _tier TEXT;
    _current_count INTEGER;
    _limit INTEGER;
BEGIN
    -- Resolve the owner of this tab via tab_groups
    SELECT user_id INTO _user_id
    FROM tab_groups
    WHERE id = NEW.group_id;

    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'tab_group not found: %', NEW.group_id;
    END IF;

    -- Get subscription tier and current count
    SELECT subscription_tier, tab_count
    INTO _tier, _current_count
    FROM profiles
    WHERE id = _user_id;

    -- Determine limit for this tier
    _limit := CASE _tier
        WHEN 'cloud_paid' THEN NULL   -- unlimited
        WHEN 'cloud_free' THEN 75
        ELSE NULL                      -- unknown tier = no limit (safe default)
    END;

    -- Enforce: reject if at or over limit
    IF _limit IS NOT NULL AND _current_count >= _limit THEN
        RAISE EXCEPTION 'tab_limit_exceeded: % tabs (limit %)', _current_count, _limit
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_tab_limit_trigger
    BEFORE INSERT ON tabs
    FOR EACH ROW EXECUTE FUNCTION enforce_tab_limit();

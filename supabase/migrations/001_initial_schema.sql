-- TabVault Initial Schema
-- Migration 001: Core tables, RLS policies, and triggers

-- =============================================================================
-- Profiles
-- =============================================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    subscription_tier TEXT NOT NULL DEFAULT 'cloud_free',
    tab_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own profile" ON profiles
    FOR ALL USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- Devices
-- =============================================================================
CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_name TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own devices" ON devices
    FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- Tab Groups
-- =============================================================================
CREATE TABLE tab_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    is_auto_save BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tab_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tab groups" ON tab_groups
    FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- Tabs
-- =============================================================================
CREATE TABLE tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES tab_groups(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    favicon_url TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage tabs in own groups" ON tabs
    FOR ALL USING (
        group_id IN (SELECT id FROM tab_groups WHERE user_id = auth.uid())
    );

-- =============================================================================
-- Tab Count Trigger
-- =============================================================================
-- Keeps profiles.tab_count in sync when tabs are inserted or deleted
CREATE OR REPLACE FUNCTION update_tab_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE profiles
        SET tab_count = (
            SELECT COUNT(*) FROM tabs t
            JOIN tab_groups tg ON t.group_id = tg.id
            WHERE tg.user_id = (SELECT user_id FROM tab_groups WHERE id = NEW.group_id)
        )
        WHERE id = (SELECT user_id FROM tab_groups WHERE id = NEW.group_id);
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE profiles
        SET tab_count = (
            SELECT COUNT(*) FROM tabs t
            JOIN tab_groups tg ON t.group_id = tg.id
            WHERE tg.user_id = (SELECT user_id FROM tab_groups WHERE id = OLD.group_id)
        )
        WHERE id = (SELECT user_id FROM tab_groups WHERE id = OLD.group_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_tab_count_trigger
    AFTER INSERT OR DELETE ON tabs
    FOR EACH ROW EXECUTE FUNCTION update_tab_count();

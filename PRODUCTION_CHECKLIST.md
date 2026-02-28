# TabVault — Production Checklist

## Supabase Secrets (Edge Functions → Secrets)

- [ ] `OPENAI_API_KEY` — OpenAI API key for GPT-4.1-nano categorization
- [ ] `RESEND_API_KEY` — Resend API key for abuse block email notifications
- [ ] `OWNER_EMAIL` — Your email address for abuse alert notifications

## Supabase Edge Functions (deploy each)

- [ ] `categorize-tabs` — AI tab categorization proxy (OpenAI)
- [ ] `notify-owner-blocked-user` — Sends email when a user gets permanently blocked
- [ ] `lemon-squeezy-webhook` — Payment webhook handler

## Supabase Database

- [ ] All migrations applied (check `supabase/migrations/`)
- [ ] Run `NOTIFY pgrst, 'reload schema'` after applying new migrations
- [ ] `profiles` table has `ai_blocked` column (migration 006)
- [ ] `abuse_flags` table exists (migration 006)
- [ ] `tab_groups` table has `sub_groups`, `summary`, `tags` columns (migration 006)

## Resend (resend.com)

- [ ] Account created (free tier: 3,000 emails/month)
- [ ] Domain `tabvault.com` verified for sending (or use Resend's test domain for dev)
- [ ] `from` address `alerts@tabvault.com` is authorized

## Payment (when ready)

- [ ] Replace fake upgrade button with real checkout URL in `SettingsPanel.tsx`
- [ ] Uncomment `getCheckoutUrl` import
- [ ] Restore original `handleUpgrade` function

## Constants to verify before launch

- [ ] `ABUSE_THRESHOLDS.BLOCK_AT` is `5` (not lowered for testing)
- [ ] `ABUSE_THRESHOLDS.FLAG_AT` is `3`
- [ ] `CATEGORIZATION_LIMITS.MIN_TABS` is `5`
- [ ] `CATEGORIZATION_LIMITS.MAX_TOKENS` is `4096`

## Build & Test

- [ ] `npx vitest run` — all tests pass
- [ ] `npx wxt build` — clean production build
- [ ] Load built extension in Chrome, test save/restore/search/categorize
- [ ] Test dark mode toggle in full-page view
- [ ] Verify categorization returns tabs inside sub-groups (not empty)

-- Phase 20: Extra conversations balance for conversation packs
ALTER TABLE customer_users
  ADD COLUMN IF NOT EXISTS extra_conversations_balance INTEGER NOT NULL DEFAULT 0;

-- Table to log pack purchases for auditing
CREATE TABLE IF NOT EXISTS conversation_pack_purchases (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id            UUID NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  pack_id                     TEXT NOT NULL,           -- e.g. 'pack_100', 'pack_300', 'pack_600'
  conversations_added         INTEGER NOT NULL,
  amount_cents                INTEGER NOT NULL,
  stripe_checkout_session_id  TEXT UNIQUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

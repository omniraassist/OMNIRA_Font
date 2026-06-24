-- Phase 15: Stripe Subscriptions — auto-renewal support
-- Run in Supabase SQL Editor

ALTER TABLE customer_users
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

ALTER TABLE pricing_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

COMMENT ON COLUMN customer_users.stripe_subscription_id IS 'Stripe Subscription ID for auto-renewing plans (sub_...)';
COMMENT ON COLUMN pricing_plans.stripe_price_id IS 'Stripe recurring Price ID for this plan (price_...). When set, checkout uses subscription mode.';

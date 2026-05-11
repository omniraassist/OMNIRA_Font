-- =============================================================================
-- Omnira — single database schema (one file, no separate migrations)
-- =============================================================================
-- Apply with:
--   • Supabase → SQL Editor → paste & run this entire file, or
--   • From server folder: npm run db:up   (requires DATABASE_URL in .env)
--
-- Destructive reset (drops all Omnira tables, then re-applies):
--   npm run db:reset
--
-- Tables: admin + customer auth, Stripe payments, notifications, WhatsApp templates
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_password_resets (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  reset_token text not null unique,
  expires_at timestamptz not null,
  is_used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_password_resets_admin_id
  on public.admin_password_resets(admin_user_id);

create index if not exists idx_admin_password_resets_token
  on public.admin_password_resets(reset_token);

-- ---------------------------------------------------------------------------
-- Customers (login + Stripe subscription fields)
-- ---------------------------------------------------------------------------

create table if not exists public.customer_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  first_name text,
  last_name text,
  phone text,
  is_active boolean not null default true,
  stripe_customer_id text,
  subscription_plan_id text,
  subscription_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_users add column if not exists stripe_customer_id text;
alter table public.customer_users add column if not exists subscription_plan_id text;
alter table public.customer_users add column if not exists subscription_ends_at timestamptz;

create index if not exists idx_customer_users_subscription_ends
  on public.customer_users(subscription_ends_at);

-- ---------------------------------------------------------------------------
-- Stripe: one row per successful payment (Checkout redirect and/or embedded PI)
-- stripe_checkout_session_id is NULL for embedded-only flows
-- ---------------------------------------------------------------------------

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references public.customer_users(id) on delete cascade,
  plan_id text not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_cents integer not null,
  currency text not null default 'eur',
  period_days integer not null,
  subscription_end_after timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.customer_payments add column if not exists stripe_payment_intent_id text;

-- Embedded PaymentIntent flow: session id optional (no-op if already nullable)
alter table public.customer_payments alter column stripe_checkout_session_id drop not null;

create index if not exists idx_customer_payments_user
  on public.customer_payments(customer_user_id);

create unique index if not exists idx_customer_payments_stripe_pi_unique
  on public.customer_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- ---------------------------------------------------------------------------
-- Customer password reset
-- ---------------------------------------------------------------------------

create table if not exists public.customer_password_resets (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references public.customer_users(id) on delete cascade,
  reset_token text not null unique,
  expires_at timestamptz not null,
  is_used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_password_resets_customer_id
  on public.customer_password_resets(customer_user_id);

create index if not exists idx_customer_password_resets_token
  on public.customer_password_resets(reset_token);

-- ---------------------------------------------------------------------------
-- In-app notifications (admin → users)
-- ---------------------------------------------------------------------------

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  target_email text,
  title text not null,
  message text not null,
  created_by text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_target_email
  on public.user_notifications(target_email);

create index if not exists idx_user_notifications_created_at
  on public.user_notifications(created_at desc);

-- ---------------------------------------------------------------------------
-- WhatsApp Business message templates (sync metadata)
-- ---------------------------------------------------------------------------

create table if not exists public.whatsapp_message_templates (
  id uuid primary key default gen_random_uuid(),
  template_name text not null unique,
  category text not null,
  status text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_message_templates_synced
  on public.whatsapp_message_templates(last_synced_at desc);

-- =============================================================================
-- Stripe Dashboard → Webhooks → your endpoint (e.g. https://API/api/stripe/webhook)
--   Required events:
--     • checkout.session.completed   (Stripe Checkout redirect)
--     • payment_intent.succeeded     (embedded Payment Element in panel)
-- Backend .env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET (whsec_…)
-- Frontend: VITE_API_BASE → same API host
-- =============================================================================

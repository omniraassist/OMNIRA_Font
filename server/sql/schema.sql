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
  avatar_data_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_users add column if not exists avatar_data_url text;

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

-- ---------------------------------------------------------------------------
-- WhatsApp conversation log + extracted leads (Phase 1 — single-tenant; the
-- customer_user_id FK is nullable now so Phase 3 multi-tenant can backfill
-- without migration).
-- ---------------------------------------------------------------------------

create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid references public.customer_users(id) on delete set null,
  phone_number_id text,
  wa_from text not null,
  wa_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text,
  body text,
  meta_payload jsonb,
  language text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_wa_messages_wa_message_id_unique
  on public.wa_messages(wa_message_id)
  where wa_message_id is not null;

create index if not exists idx_wa_messages_wa_from
  on public.wa_messages(wa_from);

create index if not exists idx_wa_messages_created_at
  on public.wa_messages(created_at desc);

create index if not exists idx_wa_messages_phone_number_id
  on public.wa_messages(phone_number_id);

create table if not exists public.wa_leads (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid references public.customer_users(id) on delete set null,
  phone_number_id text,
  wa_from text not null,
  name text,
  email text,
  phone text,
  intent text,
  language text,
  confidence numeric,
  notes text,
  status text not null default 'new' check (status in ('new','contacted','qualified','converted','lost')),
  first_seen_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_wa_leads_phone_number_wa_from_unique
  on public.wa_leads(phone_number_id, wa_from);

create index if not exists idx_wa_leads_created_at
  on public.wa_leads(created_at desc);

create index if not exists idx_wa_leads_status
  on public.wa_leads(status);

create index if not exists idx_wa_leads_email
  on public.wa_leads(email);

-- ---------------------------------------------------------------------------
-- Pricing plans (admin-editable; Stripe Checkout reads amount_cents at runtime).
-- One row per pack. id matches the customer-facing plan_id used by Stripe metadata.
-- ---------------------------------------------------------------------------

create table if not exists public.pricing_plans (
  id text primary key,
  label text not null,
  period_text text,
  amount_cents integer not null check (amount_cents > 0),
  duration_days integer not null check (duration_days > 0),
  currency text not null default 'eur',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.pricing_plans (id, label, period_text, amount_cents, duration_days, sort_order)
values
  ('monthly',    '1 mes',    '/mes',  4900,  30, 1),
  ('quarterly',  '3 meses',  '/mes', 12900,  90, 2),
  ('semiannual', '6 meses',  '/mes', 22900, 180, 3),
  ('annual',     '12 meses', '/mes', 39900, 365, 4)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Bot configuration (system prompt + knowledge base + greeting + lead extraction
-- prompt). One platform row, one per paying customer. Admins edit the platform
-- row from /bot-config; customers edit their own from the Knowledge Training
-- panel. metaWhatsAppWebhook reads from this table — the prompt is no longer
-- hardcoded in source.
-- ---------------------------------------------------------------------------

create table if not exists public.bot_configs (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform','customer')),
  customer_user_id uuid references public.customer_users(id) on delete cascade,
  system_prompt text,
  knowledge_base text,
  greeting text,
  lead_extraction_prompt text,
  is_active boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bot_configs_customer_required_when_customer
    check ((scope = 'customer' and customer_user_id is not null) or (scope = 'platform' and customer_user_id is null))
);

create unique index if not exists idx_bot_configs_platform_unique
  on public.bot_configs(scope) where scope = 'platform';

create unique index if not exists idx_bot_configs_customer_unique
  on public.bot_configs(customer_user_id) where scope = 'customer';

-- ---------------------------------------------------------------------------
-- Platform settings (admin-editable). The Meta WhatsApp + OpenAI runtime keys
-- can either live in Vercel env OR be overridden here from the admin panel.
-- Read order at runtime: this table → process.env → built-in default.
-- ---------------------------------------------------------------------------

create table if not exists public.platform_settings (
  key text primary key,
  value text,
  is_secret boolean not null default false,
  description text,
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, is_secret, description) values
  ('META_WABA_VERIFY_TOKEN',          true,  'Meta webhook verify token — must match the value entered in Meta App → WhatsApp → Configuration → Verify token.'),
  ('META_WABA_ACCESS_TOKEN',          true,  'Long-lived system user access token from Meta with whatsapp_business_messaging scope.'),
  ('META_WABA_APP_SECRET',            true,  'Meta App secret (App Dashboard → Settings → Basic). Used to verify X-Hub-Signature-256 on inbound POSTs.'),
  ('META_WABA_PHONE_NUMBER_ID',       false, 'Phone number ID for the WhatsApp Business number (Meta API Setup).'),
  ('META_WABA_BUSINESS_ACCOUNT_ID',   false, 'WABA ID from Meta Business Suite → WhatsApp Accounts.'),
  ('META_WABA_GRAPH_VERSION',         false, 'Graph API version, e.g. v21.0. Default v21.0 if not set.'),
  ('META_WABA_WEBHOOK_SKIP_SIGNATURE',false, 'true | false. Only set true if META_WABA_APP_SECRET cannot be provided.'),
  ('META_WABA_MARKETING_AUTO_REPLY',  false, 'Optional fixed reply text. If set, OpenAI is not called.'),
  ('OPENAI_API_KEY',                  true,  'OpenAI API key used for the agent and lead extraction.'),
  ('OPENAI_CHAT_MODEL',               false, 'OpenAI model id, default gpt-4o-mini.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Per-customer WhatsApp credentials (Phase-3 multi-tenant routing). After
-- payment, the customer fills these in from their dashboard so the Omnira
-- webhook can route inbound messages on their phone_number_id to their own
-- prompt + knowledge base (in bot_configs.customer).
-- ---------------------------------------------------------------------------

create table if not exists public.customer_whatsapp_configs (
  customer_user_id uuid primary key references public.customer_users(id) on delete cascade,
  meta_access_token text,
  meta_phone_number_id text,
  meta_business_account_id text,
  meta_app_secret text,
  meta_verify_token text,
  meta_graph_version text default 'v21.0',
  meta_display_phone_number text,
  meta_verified_name text,
  is_active boolean not null default false,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_customer_whatsapp_configs_phone_number_id
  on public.customer_whatsapp_configs(meta_phone_number_id)
  where meta_phone_number_id is not null;

-- ---------------------------------------------------------------------------
-- OpenAI fallback keys (admin-editable). If Vercel env OPENAI_API_KEY fails
-- with 401 / 429 / insufficient_quota the webhook walks this list in order
-- and uses the first key that succeeds. fail_count / last_failed_at give the
-- admin visibility into which keys to rotate.
-- ---------------------------------------------------------------------------

create table if not exists public.openai_api_keys (
  id uuid primary key default gen_random_uuid(),
  label text,
  api_key text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  last_used_at timestamptz,
  last_failed_at timestamptz,
  last_fail_reason text,
  fail_count integer not null default 0,
  success_count integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_openai_api_keys_active_order
  on public.openai_api_keys(is_active, sort_order, created_at);

-- =============================================================================
-- Stripe Dashboard → Webhooks → your endpoint (e.g. https://API/api/stripe/webhook)
--   Required events:
--     • checkout.session.completed   (Stripe Checkout redirect)
--     • payment_intent.succeeded     (embedded Payment Element in panel)
-- Backend .env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET (whsec_…)
-- Frontend: VITE_API_BASE → same API host
-- =============================================================================

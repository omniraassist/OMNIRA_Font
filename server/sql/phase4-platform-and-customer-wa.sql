-- Phase 4: admin-editable platform settings (Meta + OpenAI keys can live in DB
-- and override Vercel env) + per-customer WhatsApp credentials (Phase-3 routing).
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → paste & Run.

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

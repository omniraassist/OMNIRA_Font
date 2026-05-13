-- Phase 5: admin-managed OpenAI API key fallback chain. When a Vercel env
-- OPENAI_API_KEY hits 401 / 429 / insufficient_quota at runtime, the webhook
-- automatically retries with each active row in this table (sorted by
-- sort_order, then created_at). Admin manages the list from the WhatsApp
-- config page. Idempotent. Apply via Supabase Dashboard → SQL Editor.

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

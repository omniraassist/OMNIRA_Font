-- Phase 1: WhatsApp conversation log + extracted leads.
-- Idempotent (CREATE TABLE IF NOT EXISTS) — safe to run multiple times.
-- Apply via Supabase Dashboard → SQL Editor → paste & Run.

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

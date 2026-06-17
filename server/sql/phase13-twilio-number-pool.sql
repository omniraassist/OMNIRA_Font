-- Phase 13: Twilio virtual number pool
-- Each row is a Twilio WhatsApp-enabled number Omnira owns.
-- status: 'available' | 'assigned' | 'suspended'

create table if not exists public.twilio_number_pool (
  id                  uuid primary key default gen_random_uuid(),
  phone_number        text not null unique,          -- E.164, e.g. +34911234567
  twilio_sid          text not null unique,           -- PNxxxxxxxx from Twilio
  friendly_name       text,
  status              text not null default 'available'
                        check (status in ('available','assigned','suspended')),
  customer_user_id    uuid references public.customer_users(id) on delete set null,
  assigned_at         timestamptz,
  released_at         timestamptz,
  monthly_cost_cents  integer not null default 100,  -- cost Omnira pays to Twilio
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists twilio_number_pool_status_idx
  on public.twilio_number_pool(status);

create index if not exists twilio_number_pool_customer_idx
  on public.twilio_number_pool(customer_user_id);

-- Inbound message log for Twilio (parallel to wa_messages for Meta)
create table if not exists public.twilio_messages (
  id               uuid primary key default gen_random_uuid(),
  customer_user_id uuid references public.customer_users(id) on delete set null,
  twilio_number    text not null,   -- the Omnira number that received/sent the message
  wa_from          text not null,   -- end-user phone E.164
  direction        text not null check (direction in ('inbound','outbound')),
  body             text,
  twilio_sid       text,            -- MessageSid from Twilio
  openai_used      boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists twilio_messages_customer_idx
  on public.twilio_messages(customer_user_id, created_at desc);

create index if not exists twilio_messages_number_idx
  on public.twilio_messages(twilio_number, wa_from);

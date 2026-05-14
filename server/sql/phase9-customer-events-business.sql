-- Phase 9: real customer-side tables for bookings (events) + business info.
-- Replaces the localStorage stubs that the customer dashboard was using for
-- /api/events and /api/business. Idempotent. Apply via Supabase SQL Editor.

create table if not exists public.customer_events (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references public.customer_users(id) on delete cascade,
  name text,
  datetime timestamptz not null,
  service text,
  phone text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'bot')),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_events_user_dt
  on public.customer_events(customer_user_id, datetime);

create index if not exists idx_customer_events_user_created
  on public.customer_events(customer_user_id, created_at desc);

create table if not exists public.customer_business_info (
  customer_user_id uuid primary key references public.customer_users(id) on delete cascade,
  name text,
  type text,
  phone text,
  email text,
  address text,
  hours text,
  services text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

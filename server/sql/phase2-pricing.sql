-- Phase 2: admin-editable pricing plans. Stripe Checkout / PaymentIntent reads
-- amount_cents from this table at request time. The seed values reflect the
-- current Omnira pack prices; admins change them via /api/admin/pricing.
-- Idempotent (CREATE TABLE IF NOT EXISTS + INSERT … ON CONFLICT DO NOTHING).
-- Apply via Supabase Dashboard → SQL Editor → paste & Run.

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

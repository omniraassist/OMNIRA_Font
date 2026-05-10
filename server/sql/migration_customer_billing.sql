-- Run once on existing Supabase projects (safe to re-run)
alter table public.customer_users add column if not exists stripe_customer_id text;
alter table public.customer_users add column if not exists subscription_plan_id text;
alter table public.customer_users add column if not exists subscription_ends_at timestamptz;

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references public.customer_users(id) on delete cascade,
  plan_id text not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  amount_cents integer not null,
  currency text not null default 'eur',
  period_days integer not null,
  subscription_end_after timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_payments_user on public.customer_payments(customer_user_id);
create index if not exists idx_customer_users_subscription_ends on public.customer_users(subscription_ends_at);

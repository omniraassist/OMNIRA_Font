-- Phase 14: Monthly conversation limits per customer (Twilio Plan A cost model)
-- Each row = one unique end-user contact within a calendar month for a customer.
-- Counting rows by (customer_user_id, month_key) gives conversations used this month.

create table if not exists public.twilio_conversation_windows (
  id               uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references public.customer_users(id) on delete cascade,
  wa_from          text not null,           -- end-user E.164 phone
  month_key        text not null,           -- 'YYYY-MM'
  first_message_at timestamptz not null default now(),
  constraint twilio_conv_windows_unique unique (customer_user_id, wa_from, month_key)
);

create index if not exists twilio_conv_windows_customer_month_idx
  on public.twilio_conversation_windows(customer_user_id, month_key);

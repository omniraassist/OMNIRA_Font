-- Phase 15: allow bot-created events without a customer_user_id
-- (events created by the platform agent from Omnira's own WhatsApp number
--  don't have a customer_user_id yet — they come from prospective clients)

alter table public.customer_events
  alter column customer_user_id drop not null;

-- Index so the admin calendar query stays fast when filtering by source/status
create index if not exists idx_customer_events_source_status
  on public.customer_events(source, status);

create index if not exists idx_customer_events_phone
  on public.customer_events(phone);

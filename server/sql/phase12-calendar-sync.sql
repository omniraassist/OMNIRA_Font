-- Phase 12: External calendar sync (Google Calendar + Microsoft + Apple in future).
--
-- Foundation for the customer-panel "Calendars" feature: each customer can connect
-- one or more external calendar accounts, OMNIRA pushes their bookings to those
-- calendars and (Phase 2) reads back busy times for availability checks.
--
-- Idempotent. Apply via Supabase Dashboard -> SQL Editor -> paste & Run.

-- ── customer_events: add explicit end timestamp ────────────────────────────────
-- Until now an event was an instant. Real calendar systems need a window.
-- Optional column — when null, the sync layer assumes a 60-minute default.
alter table public.customer_events
  add column if not exists end_at timestamptz;

-- ── customer_calendar_connections — one row per linked external account ───────
create table if not exists public.customer_calendar_connections (
  id                       uuid primary key default gen_random_uuid(),
  customer_user_id         uuid not null references public.customer_users(id) on delete cascade,
  provider                 text not null check (provider in ('google', 'microsoft', 'apple')),
  -- The Google/MS account email or Apple ID. Used to label the connection in the UI.
  account_email            text,
  -- AES-256-GCM ciphertext of the OAuth/credential payload. JSON shape:
  --   google/microsoft: { access_token, refresh_token, scope, token_type }
  --   apple:            { app_password }  (no OAuth)
  -- See server/src/calendar/crypto.js for the encryption format.
  encrypted_credentials    text not null,
  token_expires_at         timestamptz,
  -- The user-selected calendar to push events into. For Google it's a calendarId
  -- (often "primary"); for MS the calendar id; for Apple the CalDAV calendar URL.
  target_calendar_id       text default 'primary',
  target_calendar_name     text,
  -- Apple-specific: CalDAV base URL discovered at connect time.
  caldav_base_url          text,
  -- Incremental-sync cursors (Phase 2):
  sync_token               text,       -- Google syncToken
  delta_link               text,       -- Microsoft Graph delta link
  ctag                     text,       -- Apple CalDAV collection ctag
  -- Webhook subscription bookkeeping (Phase 2):
  watch_channel_id         text,
  watch_resource_id        text,
  watch_client_state       text,
  watch_expires_at         timestamptz,
  status                   text not null default 'active' check (status in ('active', 'revoked', 'error')),
  last_sync_at             timestamptz,
  last_error               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists ccc_customer_idx on public.customer_calendar_connections (customer_user_id);
create unique index if not exists ccc_uniq_per_provider_account
  on public.customer_calendar_connections (customer_user_id, provider, account_email);

-- ── customer_event_external_refs — one OMNIRA event maps to N externals ───────
-- Lets us push the same booking to every connected calendar without losing track
-- of which external event id corresponds to which OMNIRA event in which calendar.
-- Also caches busy windows pulled from external calendars (omnira_event_id null).
create table if not exists public.customer_event_external_refs (
  id                       uuid primary key default gen_random_uuid(),
  omnira_event_id          uuid references public.customer_events(id) on delete cascade,
  connection_id            uuid not null references public.customer_calendar_connections(id) on delete cascade,
  provider                 text not null,
  external_event_id        text not null,
  external_etag            text,
  external_ical_uid        text,
  -- Direction tells the importer whether we authored this event (outbound -> don't
  -- import) or the external calendar did (inbound -> reflect as busy only).
  direction                text not null check (direction in ('outbound', 'inbound')),
  -- For inbound rows, the busy window used by /api/customer/availability.
  busy_start               timestamptz,
  busy_end                 timestamptz,
  busy_status              text default 'busy',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create unique index if not exists ceer_uniq_per_conn_external
  on public.customer_event_external_refs (connection_id, external_event_id);
create index if not exists ceer_omnira_event_idx
  on public.customer_event_external_refs (omnira_event_id);
create index if not exists ceer_busy_window_idx
  on public.customer_event_external_refs (connection_id, busy_start, busy_end);

-- ── calendar_sync_jobs — DB-backed retry queue ────────────────────────────────
-- A pragmatic queue for serverless. Outbound mutations enqueue a job; a drain
-- worker (cron + post-API fire-and-forget) processes it with exponential backoff.
create table if not exists public.calendar_sync_jobs (
  id                       uuid primary key default gen_random_uuid(),
  connection_id            uuid not null references public.customer_calendar_connections(id) on delete cascade,
  op                       text not null check (op in ('create', 'update', 'delete', 'pull')),
  -- Snapshot of the OMNIRA event payload at enqueue time. For delete ops this
  -- includes the external_event_id pulled from external_refs before the local
  -- row was removed.
  payload                  jsonb not null default '{}'::jsonb,
  attempts                 int not null default 0,
  next_attempt_at          timestamptz not null default now(),
  last_error               text,
  status                   text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists csj_due_idx
  on public.calendar_sync_jobs (status, next_attempt_at) where status = 'pending';

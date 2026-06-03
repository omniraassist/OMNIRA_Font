-- Phase 11: email drafts. The admin email client lets you compose, save a draft
-- (so the message survives a page reload / accidental close), and send when
-- ready. Drafts live here in Supabase rather than in IMAP because (a) most
-- IMAP servers store drafts as full RFC822 blobs which are awkward to edit
-- partially, and (b) Supabase round-trips are 10× faster than IMAP for the
-- small JSON payloads a draft actually needs.
--
-- Apply via Supabase Dashboard → SQL Editor → paste & Run. Idempotent.

create table if not exists public.email_drafts (
  id           uuid primary key default gen_random_uuid(),
  to_addr      text not null default '',
  cc_addr      text not null default '',
  bcc_addr     text not null default '',
  subject      text not null default '',
  body_text    text not null default '',
  body_html    text not null default '',
  in_reply_to  text,                 -- IMAP UID of the original message, if this is a reply
  reply_folder text,                 -- which folder that UID belongs to
  updated_by   text not null default 'admin',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists email_drafts_updated_at_idx
  on public.email_drafts (updated_at desc);

-- Phase 7: also store META_WABA_WEBHOOK_INSECURE_LOCAL in platform_settings so
-- the admin WhatsApp config page can edit it from one place. Idempotent.

insert into public.platform_settings (key, is_secret, description) values
  ('META_WABA_WEBHOOK_INSECURE_LOCAL', false,
   'Local-dev flag (NODE_ENV != production). true → skip HMAC verification in development. Ignored on Vercel production.')
on conflict (key) do nothing;

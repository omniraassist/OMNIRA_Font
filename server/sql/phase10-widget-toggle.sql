-- Phase 10: admin-controlled "show WhatsApp widget on landing" toggle.
-- Seeds OMNIRA_WIDGET_WHATSAPP_ENABLED='true' into public.platform_settings so
-- the admin WhatsApp settings page can flip it on/off without a redeploy.
-- The public endpoint /api/public/widget-settings reads this; the landing
-- page's <WhatsAppFloat /> renders only when it is true.
--
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → paste & Run.

insert into public.platform_settings (key, value, is_secret, description)
values (
  'OMNIRA_WIDGET_WHATSAPP_ENABLED',
  'true',
  false,
  'true → render the floating WhatsApp button on the public landing page. false → hide it. Effective in ~30 s after change (in-process cache).'
)
on conflict (key) do nothing;

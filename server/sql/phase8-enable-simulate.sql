-- Phase 8: enable the temporary "Test · skip payment" button on the customer
-- payment screen. This seeds OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE='true' into
-- public.platform_settings. The simulate endpoint reads DB first, env fallback,
-- so this row alone is enough to enable the button without a redeploy.
--
-- REMOVE when payment testing is done:
--   delete from public.platform_settings where key = 'OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE';
--
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → paste & Run.

insert into public.platform_settings (key, value, is_secret, description)
values (
  'OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE',
  'true',
  false,
  'TEMP. true → enables /api/customer/subscription/simulate (the dev-mode "Test · skip payment" button on the customer payment screen). Remove or set to false once payment work is done.'
)
on conflict (key) do update set value = excluded.value, updated_at = now();

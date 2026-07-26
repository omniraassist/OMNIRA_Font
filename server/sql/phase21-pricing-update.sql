-- Phase 21: Update plan prices (~20% increase) and reduce conversation limits
UPDATE pricing_plans SET
  amount_cents = 5900,
  conversation_limit = 200,
  updated_at = NOW()
WHERE id = 'monthly';

UPDATE pricing_plans SET
  amount_cents = 15900,
  conversation_limit = 200,
  updated_at = NOW()
WHERE id = 'quarterly';

UPDATE pricing_plans SET
  amount_cents = 27900,
  conversation_limit = 250,
  updated_at = NOW()
WHERE id = 'semiannual';

UPDATE pricing_plans SET
  amount_cents = 47900,
  conversation_limit = 300,
  updated_at = NOW()
WHERE id = 'annual';

-- Add conversation_limit column if not exists (informational, not used by backend logic — limits are in twilio.js)
ALTER TABLE pricing_plans
  ADD COLUMN IF NOT EXISTS conversation_limit INTEGER;

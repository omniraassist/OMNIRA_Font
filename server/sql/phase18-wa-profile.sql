ALTER TABLE customer_whatsapp_configs
  ADD COLUMN IF NOT EXISTS wa_profile JSONB DEFAULT '{}'::jsonb;

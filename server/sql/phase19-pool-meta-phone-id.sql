ALTER TABLE twilio_number_pool
  ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT;

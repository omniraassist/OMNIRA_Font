-- Phase 17: WhatsApp activation status per Twilio number
-- whatsapp_status tracks whether the number is approved for WhatsApp through Twilio.
-- pending   → purchased but not yet WhatsApp-enabled
-- active    → WhatsApp confirmed working (auto-verified or manually confirmed)
-- failed    → WhatsApp activation failed
-- Pool assignment only picks 'active' numbers.

ALTER TABLE public.twilio_number_pool
  ADD COLUMN IF NOT EXISTS whatsapp_status text NOT NULL DEFAULT 'pending'
    CHECK (whatsapp_status IN ('pending', 'active', 'failed')),
  ADD COLUMN IF NOT EXISTS messaging_service_sid text;

-- Existing numbers without explicit status: mark active so they keep working.
UPDATE public.twilio_number_pool
  SET whatsapp_status = 'active'
  WHERE whatsapp_status = 'pending' AND status IN ('assigned', 'available');

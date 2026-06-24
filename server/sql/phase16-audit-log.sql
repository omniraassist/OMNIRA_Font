-- Phase 16: Admin Audit Log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text,
  action     text        NOT NULL,
  entity     text,
  entity_id  text,
  detail     jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);

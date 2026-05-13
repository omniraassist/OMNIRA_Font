-- Phase 6: admin profile avatar. Stored as a data: URL (base64) directly in
-- admin_users so no Supabase Storage bucket is required. The /profile page
-- resizes the upload to 256×256 JPEG quality 0.82 client-side before sending,
-- which keeps the encoded payload well under the server's 256 KB cap.
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → paste & Run.

alter table public.admin_users
  add column if not exists avatar_data_url text;

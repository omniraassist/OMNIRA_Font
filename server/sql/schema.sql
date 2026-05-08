-- Omnira auth schema (4 tables)
-- Requirements covered:
-- 1) Separate admin login table (no signup flow for admin)
-- 2) Separate admin reset password table
-- 3) Separate customer login/signup table
-- 4) Separate customer reset password table

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_password_resets (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  reset_token text not null unique,
  expires_at timestamptz not null,
  is_used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  first_name text,
  last_name text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_password_resets (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references public.customer_users(id) on delete cascade,
  reset_token text not null unique,
  expires_at timestamptz not null,
  is_used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_password_resets_admin_id
  on public.admin_password_resets(admin_user_id);

create index if not exists idx_admin_password_resets_token
  on public.admin_password_resets(reset_token);

create index if not exists idx_customer_password_resets_customer_id
  on public.customer_password_resets(customer_user_id);

create index if not exists idx_customer_password_resets_token
  on public.customer_password_resets(reset_token);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  target_email text,
  title text not null,
  message text not null,
  created_by text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_target_email
  on public.user_notifications(target_email);

create index if not exists idx_user_notifications_created_at
  on public.user_notifications(created_at desc);

create table if not exists public.whatsapp_message_templates (
  id uuid primary key default gen_random_uuid(),
  template_name text not null unique,
  category text not null,
  status text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_message_templates_synced
  on public.whatsapp_message_templates(last_synced_at desc);

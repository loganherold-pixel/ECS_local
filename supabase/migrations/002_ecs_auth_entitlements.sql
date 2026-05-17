create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user',
  status text not null default 'active',
  access_level text not null default 'standard',
  has_full_app_access boolean not null default false,
  is_shared_account boolean not null default false,
  internal_account_type text,
  allow_password_rotation boolean not null default false,
  internal_tag text,
  account_note text,
  display_name text,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  last_seen_platform text,
  last_seen_device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entitlement_status text not null default 'free',
  provider text not null default 'system_default',
  product_id text,
  environment text,
  store_original_transaction_id text,
  store_purchase_token text,
  current_period_start_at timestamptz,
  current_period_end_at timestamptz,
  grace_expires_at timestamptz,
  revoked_at timestamptz,
  last_verified_at timestamptz,
  last_error text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  platform text not null,
  event_type text not null,
  external_event_id text,
  entitlement_status text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.operators add column if not exists email text;
alter table public.operators add column if not exists role text not null default 'user';
alter table public.operators add column if not exists status text not null default 'active';
alter table public.operators add column if not exists access_level text not null default 'standard';
alter table public.operators add column if not exists has_full_app_access boolean not null default false;
alter table public.operators add column if not exists is_shared_account boolean not null default false;
alter table public.operators add column if not exists internal_account_type text;
alter table public.operators add column if not exists allow_password_rotation boolean not null default false;
alter table public.operators add column if not exists internal_tag text;
alter table public.operators add column if not exists account_note text;
alter table public.operators add column if not exists display_name text;
alter table public.operators add column if not exists last_login_at timestamptz;
alter table public.operators add column if not exists last_seen_at timestamptz;
alter table public.operators add column if not exists last_seen_platform text;
alter table public.operators add column if not exists last_seen_device text;
alter table public.operators add column if not exists created_at timestamptz not null default now();
alter table public.operators add column if not exists updated_at timestamptz not null default now();

alter table public.entitlements add column if not exists entitlement_status text not null default 'free';
alter table public.entitlements add column if not exists provider text not null default 'system_default';
alter table public.entitlements add column if not exists product_id text;
alter table public.entitlements add column if not exists environment text;
alter table public.entitlements add column if not exists store_original_transaction_id text;
alter table public.entitlements add column if not exists store_purchase_token text;
alter table public.entitlements add column if not exists current_period_start_at timestamptz;
alter table public.entitlements add column if not exists current_period_end_at timestamptz;
alter table public.entitlements add column if not exists grace_expires_at timestamptz;
alter table public.entitlements add column if not exists revoked_at timestamptz;
alter table public.entitlements add column if not exists last_verified_at timestamptz;
alter table public.entitlements add column if not exists last_error text;
alter table public.entitlements add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table public.entitlements add column if not exists created_at timestamptz not null default now();
alter table public.entitlements add column if not exists updated_at timestamptz not null default now();

alter table public.billing_events add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.billing_events add column if not exists platform text not null default 'system';
alter table public.billing_events add column if not exists event_type text not null default 'unknown';
alter table public.billing_events add column if not exists external_event_id text;
alter table public.billing_events add column if not exists entitlement_status text;
alter table public.billing_events add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.billing_events add column if not exists received_at timestamptz not null default now();
alter table public.billing_events add column if not exists processed_at timestamptz;
alter table public.billing_events add column if not exists created_at timestamptz not null default now();

alter table public.audit_logs add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.audit_logs add column if not exists event text not null default 'unknown';
alter table public.audit_logs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.audit_logs add column if not exists created_at timestamptz not null default now();

update public.operators
set role = 'user'
where role = 'operator';

update public.operators
set role = 'super_admin'
where role = 'admin';

update public.operators
set access_level = case
  when access_level = 'admin' then 'super_admin'
  when access_level = 'operator' then 'standard'
  else access_level
end;

update public.operators
set has_full_app_access = (
  access_level in ('full_app_access', 'super_admin')
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'operators_role_check'
  ) then
    alter table public.operators
      add constraint operators_role_check
      check (role in ('user', 'super_admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'operators_status_check'
  ) then
    alter table public.operators
      add constraint operators_status_check
      check (status in ('active', 'suspended', 'revoked'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'operators_access_level_check'
  ) then
    alter table public.operators
      add constraint operators_access_level_check
      check (access_level in ('standard', 'full_app_access', 'super_admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'operators_internal_account_type_check'
  ) then
    alter table public.operators
      add constraint operators_internal_account_type_check
      check (internal_account_type in ('friends_family', 'admin_internal') or internal_account_type is null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'entitlements_status_check'
  ) then
    alter table public.entitlements
      add constraint entitlements_status_check
      check (entitlement_status in ('free', 'pro_active', 'grace', 'expired', 'revoked'));
  end if;
end $$;

create index if not exists idx_profiles_email on public.profiles(lower(email));
create index if not exists idx_operators_email on public.operators(lower(email));
create index if not exists idx_operators_access_level on public.operators(access_level);
create index if not exists idx_entitlements_status on public.entitlements(entitlement_status);
create index if not exists idx_billing_events_user_id on public.billing_events(user_id);
create index if not exists idx_billing_events_platform on public.billing_events(platform);
create index if not exists idx_billing_events_received_at on public.billing_events(received_at desc);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_event on public.audit_logs(event);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists operators_set_updated_at on public.operators;
create trigger operators_set_updated_at
before update on public.operators
for each row
execute function public.set_updated_at();

drop trigger if exists entitlements_set_updated_at on public.entitlements;
create trigger entitlements_set_updated_at
before update on public.entitlements
for each row
execute function public.set_updated_at();

create or replace function public.handle_ecs_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(new.email, '')));
  bootstrap_role text := case
    when normalized_email = 'admin@expeditioncommand.com' then 'super_admin'
    else 'user'
  end;
  bootstrap_access_level text := case
    when normalized_email = 'admin@expeditioncommand.com' then 'super_admin'
    when normalized_email = 'ecs@friendsandfamily.com' then 'full_app_access'
    else 'standard'
  end;
  bootstrap_shared boolean := normalized_email = 'ecs@friendsandfamily.com';
  bootstrap_internal_type text := case
    when normalized_email = 'admin@expeditioncommand.com' then 'admin_internal'
    when normalized_email = 'ecs@friendsandfamily.com' then 'friends_family'
    else null
  end;
  bootstrap_note text := case
    when normalized_email = 'admin@expeditioncommand.com' then 'Internal super admin account'
    when normalized_email = 'ecs@friendsandfamily.com' then 'Friends/family shared full-access account'
    else null
  end;
  bootstrap_tag text := case
    when normalized_email = 'admin@expeditioncommand.com' then 'admin_internal'
    when normalized_email = 'ecs@friendsandfamily.com' then 'friends_family'
    else null
  end;
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', null))
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = coalesce(excluded.display_name, public.profiles.display_name),
      updated_at = now();

  insert into public.operators (
    user_id,
    email,
    role,
    status,
    access_level,
    has_full_app_access,
    is_shared_account,
    internal_account_type,
    allow_password_rotation,
    internal_tag,
    account_note,
    display_name,
    last_login_at,
    last_seen_at
  )
  values (
    new.id,
    new.email,
    bootstrap_role,
    'active',
    bootstrap_access_level,
    bootstrap_access_level in ('full_app_access', 'super_admin'),
    bootstrap_shared,
    bootstrap_internal_type,
    bootstrap_shared,
    bootstrap_tag,
    bootstrap_note,
    coalesce(new.raw_user_meta_data ->> 'display_name', null),
    now(),
    now()
  )
  on conflict (user_id) do update
  set email = excluded.email,
      role = excluded.role,
      status = 'active',
      access_level = excluded.access_level,
      has_full_app_access = excluded.has_full_app_access,
      is_shared_account = excluded.is_shared_account,
      internal_account_type = excluded.internal_account_type,
      allow_password_rotation = excluded.allow_password_rotation,
      internal_tag = excluded.internal_tag,
      account_note = excluded.account_note,
      display_name = coalesce(excluded.display_name, public.operators.display_name),
      updated_at = now();

  insert into public.entitlements (
    user_id,
    entitlement_status,
    provider,
    environment,
    last_verified_at,
    raw_payload
  )
  values (
    new.id,
    'free',
    'system_default',
    'bootstrap',
    now(),
    jsonb_build_object('bootstrap', true)
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_ecs on auth.users;
create trigger on_auth_user_created_ecs
after insert on auth.users
for each row
execute function public.handle_ecs_auth_user_created();

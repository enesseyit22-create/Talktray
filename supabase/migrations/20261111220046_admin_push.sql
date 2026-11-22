-- Admin push: store Expo tokens for app_admins, ping them when a profile is
-- created, and let the admin-push edge function record deliveries.
-- RevenueCat is not called from here. Point its webhook at the edge function
-- and set private.admin_push_config before the signup trigger will send.

create extension if not exists pg_net with schema extensions;

create table if not exists public.admin_push_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_push_tokens enable row level security;
revoke all on table public.admin_push_tokens from public, anon, authenticated;

create table if not exists public.admin_push_deliveries (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_push_deliveries enable row level security;
revoke all on table public.admin_push_deliveries from public, anon, authenticated;

create table if not exists private.admin_push_config (
  id integer primary key check (id = 1),
  function_url text not null,
  secret text not null
);

revoke all on table private.admin_push_config from public, anon, authenticated;

create or replace function public.save_admin_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean text := btrim(coalesce(p_token, ''));
begin
  if uid is null or not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(clean) < 20 or length(clean) > 256 then
    raise exception 'invalid token' using errcode = '22023';
  end if;
  if clean not like 'ExponentPushToken[%' and clean not like 'ExpoPushToken[%' then
    raise exception 'invalid token' using errcode = '22023';
  end if;

  insert into public.admin_push_tokens (user_id, token, updated_at)
  values (uid, clean, now())
  on conflict (user_id) do update
    set token = excluded.token,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.save_admin_push_token(text) from public, anon;
grant execute on function public.save_admin_push_token(text) to authenticated;

create or replace function private.notify_admins_of_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.admin_push_config;
  email text;
begin
  select * into cfg from private.admin_push_config where id = 1;
  if not found or cfg.secret is null or btrim(cfg.secret) = '' or cfg.function_url is null then
    return new;
  end if;

  select u.email into email from auth.users as u where u.id = new.id;

  perform net.http_post(
    url := cfg.function_url,
    body := jsonb_build_object(
      'kind', 'signup',
      'userId', new.id,
      'email', email,
      'username', new.username,
      'displayName', new.display_name
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-admin-push-secret', cfg.secret
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function private.notify_admins_of_signup() from public, anon, authenticated;

drop trigger if exists profiles_notify_admins_signup on public.profiles;
create trigger profiles_notify_admins_signup
  after insert on public.profiles
  for each row
  execute function private.notify_admins_of_signup();

create or replace function private.grant_named_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) = 'enesseyit22@gmail.com' then
    insert into public.app_admins (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.grant_named_admin() from public, anon, authenticated;

drop trigger if exists grant_named_admin on auth.users;
create trigger grant_named_admin
  after insert on auth.users
  for each row
  execute function private.grant_named_admin();

insert into public.app_admins (user_id)
select id
from auth.users
where lower(email) = 'enesseyit22@gmail.com'
on conflict (user_id) do nothing;

-- Manual Pro grants and a presence heartbeat.
-- pro_override_until is null (no grant), a future timestamp, or infinity (lifetime).
-- Only an admin RPC may change it. Clients may read their own value.
-- user_presence is not readable through the Data API. Admins use admin_active_users.

alter table public.profiles
  add column if not exists pro_override_until timestamptz;

create index if not exists profiles_pro_override_until_idx
  on public.profiles (pro_override_until)
  where pro_override_until is not null;

revoke insert, update on table public.profiles from authenticated;

grant insert (
  id,
  display_name,
  username,
  timezone,
  locale,
  theme,
  export_to_calendar,
  notifications_enabled,
  reminder_offsets
) on table public.profiles to authenticated;

grant update (
  display_name,
  username,
  timezone,
  locale,
  theme,
  export_to_calendar,
  notifications_enabled,
  reminder_offsets
) on table public.profiles to authenticated;

create or replace function private.protect_pro_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.pro_override_until is not null and not public.is_admin() then
      raise exception 'NOT_ADMIN' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.pro_override_until is distinct from old.pro_override_until and not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_pro_override() from public, anon, authenticated;

drop trigger if exists profiles_protect_pro_override on public.profiles;
create trigger profiles_protect_pro_override
  before insert or update on public.profiles
  for each row
  execute function private.protect_pro_override();

create or replace function public.admin_set_pro_override(p_user_id uuid, p_plan text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan text := lower(btrim(coalesce(p_plan, '')));
  until_at timestamptz;
  saved timestamptz;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if plan = 'month' then
    until_at := now() + interval '1 month';
  elsif plan = 'year' then
    until_at := now() + interval '1 year';
  elsif plan = 'lifetime' then
    until_at := 'infinity'::timestamptz;
  elsif plan = 'revoke' then
    until_at := null;
  else
    raise exception 'PLAN_INVALID' using errcode = '22023';
  end if;

  insert into public.profiles (id, pro_override_until)
  values (p_user_id, until_at)
  on conflict (id) do update
    set pro_override_until = excluded.pro_override_until
  returning pro_override_until into saved;

  return saved;
end;
$$;

revoke all on function public.admin_set_pro_override(uuid, text) from public, anon;
grant execute on function public.admin_set_pro_override(uuid, text) to authenticated;

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  platform text not null check (platform in ('ios', 'android', 'web'))
);

create index if not exists user_presence_last_seen_idx
  on public.user_presence (last_seen_at desc);

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from public, anon, authenticated;

create or replace function public.touch_presence(p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  platform text := lower(btrim(coalesce(p_platform, '')));
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if platform not in ('ios', 'android', 'web') then
    platform := 'web';
  end if;

  insert into public.user_presence (user_id, last_seen_at, platform)
  values (uid, now(), platform)
  on conflict (user_id) do update
    set last_seen_at = now(),
        platform = excluded.platform;
end;
$$;

revoke all on function public.touch_presence(text) from public, anon;
grant execute on function public.touch_presence(text) to authenticated;

create or replace function public.admin_active_users(p_within_seconds integer default 180)
returns table (
  id uuid,
  email text,
  username text,
  platform text,
  last_seen_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  window_seconds integer := least(greatest(coalesce(p_within_seconds, 180), 60), 600);
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.username,
    presence.platform,
    presence.last_seen_at
  from public.user_presence presence
  join auth.users u on u.id = presence.user_id
  left join public.profiles p on p.id = u.id
  where presence.last_seen_at >= now() - make_interval(secs => window_seconds)
  order by presence.last_seen_at desc
  limit 100;
end;
$$;

revoke all on function public.admin_active_users(integer) from public, anon;
grant execute on function public.admin_active_users(integer) to authenticated;

-- Count manual Pro grants in the existing admin stat. Store subscribers stay in RevenueCat.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  users_total bigint;
  users_today bigint;
  users_7d bigint;
  users_30d bigint;
  recordings_total bigint;
  recordings_today bigint;
  failures_24h bigint;
  failures_7d bigint;
  dau bigint;
  active_7d bigint;
  pro_active bigint := 0;
  items_by_type jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  select count(*) into users_total from auth.users;
  select count(*) into users_today from auth.users where created_at >= day_start;
  select count(*) into users_7d from auth.users where created_at >= now() - interval '7 days';
  select count(*) into users_30d from auth.users where created_at >= now() - interval '30 days';

  select count(*) into recordings_total from public.recordings;
  select count(*) into recordings_today from public.recordings where created_at >= day_start;
  select count(*) into failures_24h
    from public.recordings
    where status = 'failed' and created_at >= now() - interval '24 hours';
  select count(*) into failures_7d
    from public.recordings
    where status = 'failed' and created_at >= now() - interval '7 days';
  select count(distinct user_id) into dau
    from public.recordings
    where created_at >= day_start;
  select count(distinct user_id) into active_7d
    from public.recordings
    where created_at >= now() - interval '7 days';

  select coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
    into items_by_type
  from (
    select type, count(*) as n
    from public.items
    group by type
  ) counts;

  select count(*) into pro_active
  from public.profiles
  where pro_override_until is not null
    and pro_override_until > now();

  return jsonb_build_object(
    'users_total', users_total,
    'users_today', users_today,
    'users_7d', users_7d,
    'users_30d', users_30d,
    'recordings_total', recordings_total,
    'recordings_today', recordings_today,
    'failures_24h', failures_24h,
    'failures_7d', failures_7d,
    'items_by_type', items_by_type,
    'pro_active', pro_active,
    'dau', dau,
    'active_7d', active_7d
  );
end;
$$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

drop function if exists public.admin_recent_users(text, integer, integer);

create or replace function public.admin_recent_users(
  p_search text,
  p_limit integer,
  p_offset integer
)
returns table (
  id uuid,
  email text,
  username text,
  locale text,
  created_at timestamptz,
  last_activity timestamptz,
  recording_count bigint,
  pro_override_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(replace(replace(btrim(coalesce(p_search, '')), '%', ''), '_', ''), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.username,
    p.locale,
    u.created_at,
    greatest(p.updated_at, activity.last_recording) as last_activity,
    coalesce(activity.recording_count, 0)::bigint as recording_count,
    p.pro_override_until
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join lateral (
    select count(*)::bigint as recording_count, max(r.created_at) as last_recording
    from public.recordings r
    where r.user_id = u.id
  ) activity on true
  where v_query is null
    or coalesce(u.email, '') ilike '%' || v_query || '%'
    or coalesce(p.username, '') ilike '%' || v_query || '%'
  order by u.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.admin_recent_users(text, integer, integer) from public, anon;
grant execute on function public.admin_recent_users(text, integer, integer) to authenticated;

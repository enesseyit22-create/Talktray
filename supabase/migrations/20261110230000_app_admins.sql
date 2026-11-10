-- In-app admin directory. Rows are inserted by the service role.
-- RLS is on and there are no client policies, so the table is invisible to the app.
-- The RPCs below are the only client path, and each one requires public.is_admin().

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

revoke all on table public.app_admins from public, anon, authenticated;

alter table public.recordings add column if not exists error text;

create index if not exists recordings_status_created_idx
  on public.recordings (status, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

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

  select coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
    into items_by_type
    from (
      select type, count(*) as n
      from public.items
      group by type
    ) counts;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_pro'
  ) then
    execute 'select count(*) from public.profiles where is_pro is true' into pro_active;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'entitlement'
  ) then
    execute 'select count(*) from public.profiles where entitlement is not null and btrim(entitlement) <> ''''' into pro_active;
  end if;

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
    'dau', dau
  );
end;
$$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

create or replace function public.admin_recent_users(
  p_limit integer default 40,
  p_offset integer default 0,
  p_query text default null
)
returns table (
  id uuid,
  email text,
  username text,
  locale text,
  created_at timestamptz,
  last_activity timestamptz,
  recording_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(replace(replace(btrim(coalesce(p_query, '')), '%', ''), '_', ''), '');
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
    coalesce(activity.recording_count, 0)::bigint as recording_count
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

revoke all on function public.admin_recent_users(integer, integer, text) from public, anon;
grant execute on function public.admin_recent_users(integer, integer, text) to authenticated;

create or replace function public.admin_failed_recordings(p_limit integer default 40)
returns table (
  id uuid,
  "user" text,
  created_at timestamptz,
  error text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    coalesce(u.email::text, p.username, r.user_id::text) as "user",
    r.created_at,
    coalesce(nullif(btrim(r.error), ''), 'failed') as error
  from public.recordings r
  left join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  where r.status = 'failed'
  order by r.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.admin_failed_recordings(integer) from public, anon;
grant execute on function public.admin_failed_recordings(integer) to authenticated;

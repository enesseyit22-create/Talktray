-- Not applied by the app update. Run this in Supabase when you are ready.
-- Gifts stay Pro inside the quota RPCs, and the live-user list returns the same
-- facts the admin already sees on a person: gift plan, store Pro, and usage.
-- pro_override_plan is month, year, or lifetime. Older dated grants stay dated
-- until an admin grants again. Lifetime rows are backfilled.

alter table public.profiles
  add column if not exists pro_override_plan text;

alter table public.profiles
  drop constraint if exists profiles_pro_override_plan_check;

alter table public.profiles
  add constraint profiles_pro_override_plan_check
  check (pro_override_plan is null or pro_override_plan in ('month', 'year', 'lifetime'));

update public.profiles
set pro_override_plan = 'lifetime'
where pro_override_until = 'infinity'::timestamptz
  and pro_override_plan is null;

alter table public.user_presence
  add column if not exists store_is_pro boolean not null default false;

create or replace function private.protect_pro_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (new.pro_override_until is not null or new.pro_override_plan is not null) and not public.is_admin() then
      raise exception 'NOT_ADMIN' using errcode = '42501';
    end if;
    return new;
  end if;

  if (
    new.pro_override_until is distinct from old.pro_override_until
    or new.pro_override_plan is distinct from old.pro_override_plan
  ) and not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_pro_override() from public, anon, authenticated;

create or replace function public.admin_set_pro_override(p_user_id uuid, p_plan text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan text := lower(btrim(coalesce(p_plan, '')));
  until_at timestamptz;
  plan_name text;
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
    plan_name := 'month';
  elsif plan = 'year' then
    until_at := now() + interval '1 year';
    plan_name := 'year';
  elsif plan = 'lifetime' then
    until_at := 'infinity'::timestamptz;
    plan_name := 'lifetime';
  elsif plan = 'revoke' then
    until_at := null;
    plan_name := null;
  else
    raise exception 'PLAN_INVALID' using errcode = '22023';
  end if;

  insert into public.profiles (id, pro_override_until, pro_override_plan)
  values (p_user_id, until_at, plan_name)
  on conflict (id) do update
    set pro_override_until = excluded.pro_override_until,
        pro_override_plan = excluded.pro_override_plan
  returning pro_override_until into saved;

  return saved;
end;
$$;

revoke all on function public.admin_set_pro_override(uuid, text) from public, anon;
grant execute on function public.admin_set_pro_override(uuid, text) to authenticated;

create or replace function private.month_start(p_zone text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  zone text := coalesce(nullif(btrim(p_zone), ''), 'UTC');
begin
  return date_trunc('month', now() at time zone zone) at time zone zone;
exception
  when invalid_parameter_value then
    return date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
end;
$$;

revoke all on function private.month_start(text) from public, anon, authenticated;

create or replace function private.free_month_limit()
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  limits jsonb;
begin
  select value into limits from public.app_settings where key = 'free_limits';
  if limits is null or not (limits ? 'free_recordings_per_month') then
    return 25;
  end if;
  if jsonb_typeof(limits -> 'free_recordings_per_month') = 'null' then
    return null;
  end if;
  return (limits ->> 'free_recordings_per_month')::integer;
end;
$$;

revoke all on function private.free_month_limit() from public, anon, authenticated;

-- A gift is Pro even when the caller still passes p_is_pro false.
create or replace function public.reserve_monthly_credit(
  p_user_id uuid,
  p_recording_id uuid,
  p_is_pro boolean,
  p_period_start timestamptz
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  month_count integer;
  ever_count integer;
  free_limit integer;
  gifted boolean;
  limits jsonb;
begin
  if p_user_id is null or p_recording_id is null then
    raise exception 'recording required';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;

  select exists (
    select 1
    from public.profiles
    where id = p_user_id
      and pro_override_until is not null
      and pro_override_until > now()
  ) into gifted;

  if p_is_pro or gifted then
    return jsonb_build_object('allowed', true, 'reason', null, 'is_pro', true, 'gift', gifted);
  end if;

  select count(*) into ever_count
  from public.recordings
  where user_id = p_user_id
    and status <> 'failed'
    and id <> p_recording_id;

  if ever_count < 3 then
    return jsonb_build_object('allowed', true, 'reason', null, 'count', ever_count, 'grace', true, 'is_pro', false);
  end if;

  select value into limits
  from public.app_settings
  where key = 'free_limits';

  if limits is null or not (limits ? 'free_recordings_per_month') then
    free_limit := 25;
  elsif jsonb_typeof(limits -> 'free_recordings_per_month') = 'null' then
    free_limit := null;
  else
    free_limit := (limits ->> 'free_recordings_per_month')::integer;
  end if;

  if free_limit is null then
    return jsonb_build_object('allowed', true, 'reason', null, 'count', ever_count, 'limit', null, 'is_pro', false);
  end if;

  select count(*) into month_count
  from public.recordings
  where user_id = p_user_id
    and status <> 'failed'
    and id <> p_recording_id
    and created_at >= p_period_start;

  if month_count >= free_limit then
    return jsonb_build_object('allowed', false, 'reason', 'month', 'count', month_count, 'limit', free_limit, 'is_pro', false);
  end if;

  return jsonb_build_object('allowed', true, 'reason', null, 'count', month_count, 'limit', free_limit, 'is_pro', false);
end;
$$;

revoke all on function public.reserve_monthly_credit(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_monthly_credit(uuid, uuid, boolean, timestamptz) to service_role;

-- Older process-recording builds debit usage_monthly. A gift uses the Pro cap, not 25.
create or replace function public.consume_recording_quota(
  p_user_id uuid,
  p_is_pro boolean,
  p_period text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
  lim integer;
  gifted boolean := false;
begin
  if p_user_id is null then
    raise exception 'user required';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = p_user_id
      and pro_override_until is not null
      and pro_override_until > now()
  ) into gifted;

  lim := case when p_is_pro or gifted then 300 else 25 end;

  insert into public.usage_monthly (user_id, period, recording_count)
  values (p_user_id, p_period, 0)
  on conflict (user_id, period) do nothing;

  select recording_count into current_count
  from public.usage_monthly
  where user_id = p_user_id and period = p_period
  for update;

  if current_count >= lim then
    return jsonb_build_object('allowed', false, 'count', current_count, 'limit', lim, 'is_pro', p_is_pro or gifted, 'gift', gifted);
  end if;

  update public.usage_monthly
    set recording_count = recording_count + 1
    where user_id = p_user_id and period = p_period
    returning recording_count into current_count;

  return jsonb_build_object('allowed', true, 'count', current_count, 'limit', lim, 'is_pro', p_is_pro or gifted, 'gift', gifted);
end;
$$;

revoke all on function public.consume_recording_quota(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.consume_recording_quota(uuid, boolean, text) to service_role;

create or replace function public.my_recording_usage(p_period_start timestamptz)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ever_count integer;
  month_count integer;
  free_limit integer;
  gift_until timestamptz;
  limits jsonb;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_period_start is null then
    raise exception 'period required';
  end if;

  select count(*) into ever_count
  from public.recordings
  where user_id = uid
    and status <> 'failed';

  select count(*) into month_count
  from public.recordings
  where user_id = uid
    and status <> 'failed'
    and created_at >= p_period_start;

  select value into limits
  from public.app_settings
  where key = 'free_limits';

  if limits is null or not (limits ? 'free_recordings_per_month') then
    free_limit := 25;
  elsif jsonb_typeof(limits -> 'free_recordings_per_month') = 'null' then
    free_limit := null;
  else
    free_limit := (limits ->> 'free_recordings_per_month')::integer;
  end if;

  select pro_override_until into gift_until
  from public.profiles
  where id = uid;

  return jsonb_build_object(
    'completed_ever', ever_count,
    'completed_month', month_count,
    'trial_limit', 3,
    'free_month_limit', free_limit,
    'pro_month_limit', 300,
    'gift_until', gift_until,
    'gift_active', gift_until is not null and gift_until > now()
  );
end;
$$;

revoke all on function public.my_recording_usage(timestamptz) from public, anon;
grant execute on function public.my_recording_usage(timestamptz) to authenticated;

-- Optional store flag from the current app. The one-argument function stays for older builds.
create or replace function public.touch_presence(p_platform text, p_store_pro boolean)
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

  insert into public.user_presence (user_id, last_seen_at, platform, store_is_pro)
  values (uid, now(), platform, coalesce(p_store_pro, false))
  on conflict (user_id) do update
    set last_seen_at = now(),
        platform = excluded.platform,
        store_is_pro = excluded.store_is_pro;
end;
$$;

revoke all on function public.touch_presence(text, boolean) from public, anon;
grant execute on function public.touch_presence(text, boolean) to authenticated;

drop function if exists public.admin_active_users(integer);

create or replace function public.admin_active_users(p_within_seconds integer default 180)
returns table (
  id uuid,
  email text,
  username text,
  display_name text,
  platform text,
  last_seen_at timestamptz,
  pro_override_until timestamptz,
  pro_override_plan text,
  store_is_pro boolean,
  completed_ever bigint,
  completed_month bigint,
  free_month_limit integer,
  pro_month_limit integer,
  trial_limit integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  window_seconds integer := least(greatest(coalesce(p_within_seconds, 180), 60), 600);
  free_limit integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  free_limit := private.free_month_limit();

  return query
  select
    u.id,
    u.email::text,
    p.username,
    p.display_name,
    presence.platform,
    presence.last_seen_at,
    p.pro_override_until,
    p.pro_override_plan,
    coalesce(presence.store_is_pro, false),
    coalesce(activity.completed_ever, 0)::bigint,
    coalesce(activity.completed_month, 0)::bigint,
    free_limit,
    300,
    3
  from public.user_presence presence
  join auth.users u on u.id = presence.user_id
  left join public.profiles p on p.id = u.id
  left join lateral (
    select
      count(*) filter (where r.status <> 'failed')::bigint as completed_ever,
      count(*) filter (
        where r.status <> 'failed'
          and r.created_at >= private.month_start(p.timezone)
      )::bigint as completed_month
    from public.recordings r
    where r.user_id = u.id
  ) activity on true
  where presence.last_seen_at >= now() - make_interval(secs => window_seconds)
  order by presence.last_seen_at desc
  limit 100;
end;
$$;

revoke all on function public.admin_active_users(integer) from public, anon;
grant execute on function public.admin_active_users(integer) to authenticated;

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
  display_name text,
  locale text,
  created_at timestamptz,
  last_activity timestamptz,
  recording_count bigint,
  pro_override_until timestamptz,
  pro_override_plan text,
  store_is_pro boolean,
  completed_ever bigint,
  completed_month bigint,
  free_month_limit integer,
  pro_month_limit integer,
  trial_limit integer
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
  free_limit integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  free_limit := private.free_month_limit();

  return query
  select
    u.id,
    u.email::text,
    p.username,
    p.display_name,
    p.locale,
    u.created_at,
    greatest(p.updated_at, activity.last_recording) as last_activity,
    coalesce(activity.recording_count, 0)::bigint as recording_count,
    p.pro_override_until,
    p.pro_override_plan,
    coalesce(presence.store_is_pro, false),
    coalesce(activity.completed_ever, 0)::bigint,
    coalesce(activity.completed_month, 0)::bigint,
    free_limit,
    300,
    3
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_presence presence on presence.user_id = u.id
  left join lateral (
    select
      count(*)::bigint as recording_count,
      max(r.created_at) as last_recording,
      count(*) filter (where r.status <> 'failed')::bigint as completed_ever,
      count(*) filter (
        where r.status <> 'failed'
          and r.created_at >= private.month_start(p.timezone)
      )::bigint as completed_month
    from public.recordings r
    where r.user_id = u.id
  ) activity on true
  where v_query is null
    or coalesce(u.email, '') ilike '%' || v_query || '%'
    or coalesce(p.username, '') ilike '%' || v_query || '%'
    or coalesce(p.display_name, '') ilike '%' || v_query || '%'
  order by u.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.admin_recent_users(text, integer, integer) from public, anon;
grant execute on function public.admin_recent_users(text, integer, integer) to authenticated;

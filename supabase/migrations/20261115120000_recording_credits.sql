-- Recording credits: the ledger that monthly limits are counted from.
--
-- Before this, limits were counted from public.recordings. Users can delete their
-- own recordings (history), change their status, and set created_at, so a free
-- account could clear its history and get a fresh 25. Credits are written only by
-- the service role, are not removed when a recording is deleted, and use the
-- server clock. A credit is refunded (deleted) only by the edge function when
-- processing fails.

create table if not exists public.recording_credits (
  recording_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists recording_credits_user_created_idx
  on public.recording_credits (user_id, created_at desc);

alter table public.recording_credits enable row level security;

drop policy if exists recording_credits_select on public.recording_credits;
create policy recording_credits_select on public.recording_credits
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.recording_credits from anon, authenticated;
grant select on public.recording_credits to authenticated;

-- Existing usage carries over, so nobody gets a fresh allowance from this change.
insert into public.recording_credits (recording_id, user_id, created_at)
select id, user_id, least(created_at, now())
from public.recordings
where status <> 'failed'
on conflict (recording_id) do nothing;

-- Start of the current month in the given zone, by the server clock. Bad zones fall back to UTC.
create or replace function public.credit_month_start(p_time_zone text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  return date_trunc('month', now() at time zone coalesce(nullif(p_time_zone, ''), 'UTC'))
    at time zone coalesce(nullif(p_time_zone, ''), 'UTC');
exception when others then
  return date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
end;
$$;

-- Atomically checks the monthly cap and takes one credit for the recording.
-- Free: first 3 credits ever are always allowed, then free_limits.free_recordings_per_month
-- (25 when unset, no cap when null). Pro: 300 a month fair use.
-- A recording that already holds a credit is refused with reason 'repeat', so one credit
-- cannot be reused by pointing the same recording at new audio.
create or replace function public.reserve_recording_credit(
  p_user_id uuid,
  p_recording_id uuid,
  p_is_pro boolean,
  p_time_zone text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  period_start timestamptz := public.credit_month_start(p_time_zone);
  ever_count integer;
  month_count integer;
  month_limit integer;
  plan_limit integer;
  limits jsonb;
begin
  if p_user_id is null or p_recording_id is null then
    raise exception 'recording required';
  end if;

  -- Serializes concurrent requests from one user.
  perform 1 from public.profiles where id = p_user_id for update;

  if exists (select 1 from public.recording_credits where recording_id = p_recording_id) then
    return jsonb_build_object('allowed', false, 'reason', 'repeat');
  end if;

  select count(*) into ever_count from public.recording_credits where user_id = p_user_id;
  select count(*) into month_count
  from public.recording_credits
  where user_id = p_user_id and created_at >= period_start;

  if p_is_pro then
    plan_limit := 300;
  else
    select value into limits from public.app_settings where key = 'free_limits';
    if limits is null or not (limits ? 'free_recordings_per_month') then
      plan_limit := 25;
    elsif jsonb_typeof(limits -> 'free_recordings_per_month') = 'null' then
      plan_limit := null;
    else
      plan_limit := (limits ->> 'free_recordings_per_month')::integer;
    end if;
  end if;
  -- The first 3 recordings of a free account are never blocked.
  month_limit := case when not p_is_pro and ever_count < 3 then null else plan_limit end;

  if month_limit is not null and month_count >= month_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', case when p_is_pro then 'pro_month' else 'month' end,
      'count', month_count,
      'limit', month_limit
    );
  end if;

  insert into public.recording_credits (recording_id, user_id) values (p_recording_id, p_user_id);

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'count', month_count + 1,
    'limit', plan_limit
  );
end;
$$;

revoke all on function public.reserve_recording_credit(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.reserve_recording_credit(uuid, uuid, boolean, text) to service_role;
revoke all on function public.credit_month_start(text) from public, anon;
grant execute on function public.credit_month_start(text) to authenticated, service_role;

-- Usage card: same counts, now from credits, so deleting history no longer changes them.
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
  limits jsonb;
  free_limit integer;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_period_start is null then
    raise exception 'period required';
  end if;

  select count(*) into ever_count from public.recording_credits where user_id = uid;
  select count(*) into month_count
  from public.recording_credits
  where user_id = uid and created_at >= p_period_start;

  select value into limits from public.app_settings where key = 'free_limits';
  if limits is null or not (limits ? 'free_recordings_per_month') then
    free_limit := 25;
  elsif jsonb_typeof(limits -> 'free_recordings_per_month') = 'null' then
    free_limit := null;
  else
    free_limit := (limits ->> 'free_recordings_per_month')::integer;
  end if;

  return jsonb_build_object(
    'completed_ever', ever_count,
    'completed_month', month_count,
    'trial_limit', 3,
    'free_month_limit', free_limit,
    'pro_month_limit', 300
  );
end;
$$;

revoke all on function public.my_recording_usage(timestamptz) from public, anon;
grant execute on function public.my_recording_usage(timestamptz) to authenticated;

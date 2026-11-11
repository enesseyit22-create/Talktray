-- Read-only usage for the signed-in user. security invoker so RLS applies:
-- recordings_all only returns that user's rows, and free_limits is the public settings row.
-- Counts match process-recording / reserve_monthly_credit: non-failed recordings.
-- trial_limit is 3. free_month_limit is the settings value (25 when unset, null when unlimited).
-- pro_month_limit is the 300 fair-use cap from the app. Pro is not rejected by the edge function.

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

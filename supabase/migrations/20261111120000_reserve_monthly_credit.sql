-- Monthly credit check used by process-recording.
-- Counts real recordings (not the separate usage_monthly counter) so the
-- decision cannot drift from the edge function. The first 3 non-failed
-- recordings are always allowed, matching RECORDINGS_BEFORE_PAYWALL.
-- Default free cap is 25. A null free_recordings_per_month means no monthly cap.
-- Pro is not rejected here; the fair-use cap stays on the client demo path.

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
  limits jsonb;
begin
  if p_user_id is null or p_recording_id is null then
    raise exception 'recording required';
  end if;

  if p_is_pro then
    return jsonb_build_object('allowed', true, 'reason', null, 'is_pro', true);
  end if;

  -- Serialize concurrent recordings for this account.
  perform 1 from public.profiles where id = p_user_id for update;

  select count(*) into ever_count
  from public.recordings
  where user_id = p_user_id
    and status <> 'failed'
    and id <> p_recording_id;

  if ever_count < 3 then
    return jsonb_build_object(
      'allowed', true,
      'reason', null,
      'count', ever_count,
      'grace', true,
      'is_pro', false
    );
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
    return jsonb_build_object(
      'allowed', false,
      'reason', 'month',
      'count', month_count,
      'limit', free_limit,
      'is_pro', false
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'count', month_count,
    'limit', free_limit,
    'is_pro', false
  );
end;
$$;

revoke all on function public.reserve_monthly_credit(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_monthly_credit(uuid, uuid, boolean, timestamptz) to service_role;

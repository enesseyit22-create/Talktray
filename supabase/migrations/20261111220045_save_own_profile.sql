-- PostgREST reports success when an UPDATE matches zero rows. That happens
-- when the caller's profile row was never inserted, and also when row level
-- security filters the row out. The Settings screen then keeps the optimistic
-- value only until the next load. This function writes auth.uid()'s row and
-- raises if nothing was stored.

create or replace function public.save_own_profile(
  p_display_name text,
  p_username text,
  p_timezone text,
  p_locale text,
  p_theme text,
  p_export_to_calendar boolean,
  p_notifications_enabled boolean,
  p_reminder_offsets integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  saved public.profiles;
  clean_username text := nullif(lower(btrim(coalesce(p_username, ''))), '');
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.profiles (
    id,
    display_name,
    username,
    timezone,
    locale,
    theme,
    export_to_calendar,
    notifications_enabled,
    reminder_offsets
  )
  values (
    uid,
    p_display_name,
    clean_username,
    coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'UTC'),
    coalesce(nullif(btrim(coalesce(p_locale, '')), ''), 'en'),
    coalesce(nullif(btrim(coalesce(p_theme, '')), ''), 'system'),
    coalesce(p_export_to_calendar, false),
    coalesce(p_notifications_enabled, true),
    coalesce(p_reminder_offsets, array[0])
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    username = excluded.username,
    timezone = excluded.timezone,
    locale = excluded.locale,
    theme = excluded.theme,
    export_to_calendar = excluded.export_to_calendar,
    notifications_enabled = excluded.notifications_enabled,
    reminder_offsets = excluded.reminder_offsets
  returning * into saved;

  if saved.id is null then
    raise exception 'profile was not saved' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', saved.id,
    'display_name', saved.display_name,
    'username', saved.username
  );
end;
$$;

revoke all on function public.save_own_profile(text, text, text, text, text, boolean, boolean, integer[]) from public, anon;
grant execute on function public.save_own_profile(text, text, text, text, text, boolean, boolean, integer[]) to authenticated;

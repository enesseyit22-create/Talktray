-- Admin-editable free plan limits. Clients may read the public free_limits row.
-- Writes go through admin_set_free_limits(), which requires public.is_admin().

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select_public on public.app_settings;
create policy app_settings_select_public
  on public.app_settings
  for select
  to authenticated
  using (key = 'free_limits');

revoke all on table public.app_settings from public, anon, authenticated;
grant select (key, value, updated_at) on public.app_settings to authenticated;

insert into public.app_settings (key, value)
values (
  'free_limits',
  jsonb_build_object(
    'free_recordings_per_day', null,
    'free_recordings_per_month', 25,
    'free_max_seconds_per_recording', null,
    'free_max_items', null
  )
)
on conflict (key) do nothing;

create or replace function public.admin_set_free_limits(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current jsonb;
  v_next jsonb;
  keys text[] := array[
    'free_recordings_per_day',
    'free_recordings_per_month',
    'free_max_seconds_per_recording',
    'free_max_items'
  ];
  k text;
  raw text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'INVALID_LIMITS';
  end if;

  select value into current
  from public.app_settings
  where key = 'free_limits';
  v_next := coalesce(current, '{}'::jsonb);

  foreach k in array keys loop
    if not (p ? k) then
      continue;
    end if;
    if jsonb_typeof(p -> k) = 'null' then
      v_next := jsonb_set(v_next, array[k], 'null'::jsonb, true);
      continue;
    end if;
    raw := p ->> k;
    if raw is null or raw !~ '^[0-9]+$' then
      raise exception 'INVALID_LIMITS';
    end if;
    v_next := jsonb_set(v_next, array[k], to_jsonb(raw::integer), true);
  end loop;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('free_limits', v_next, now(), auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return v_next;
end;
$$;

revoke all on function public.admin_set_free_limits(jsonb) from public, anon;
grant execute on function public.admin_set_free_limits(jsonb) to authenticated;

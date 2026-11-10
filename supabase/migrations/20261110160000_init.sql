-- Talktray inbox: profiles, recordings, items, monthly quota.
-- Authorization uses auth.uid() only. raw_user_meta_data is copied once
-- for a display name and is never trusted for access control.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  locale text not null default 'en' check (locale in ('en', 'tr')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  export_to_calendar boolean not null default false,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text,
  transcript text,
  language text,
  duration_ms integer,
  status text not null default 'processing' check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recording_id uuid references public.recordings (id) on delete set null,
  type text not null check (type in ('task', 'reminder', 'event', 'shopping', 'note')),
  title text not null,
  notes text,
  due_at timestamptz,
  all_day boolean not null default false,
  list_name text,
  completed_at timestamptz,
  calendar_event_id text,
  notification_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_monthly (
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null,
  recording_count integer not null default 0 check (recording_count >= 0),
  primary key (user_id, period)
);

create index items_user_due_idx on public.items (user_id, due_at);
create index items_user_type_idx on public.items (user_id, type);
create index recordings_user_created_idx on public.recordings (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.recordings enable row level security;
alter table public.items enable row level security;
alter table public.usage_monthly enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy recordings_all on public.recordings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy items_all on public.items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy usage_select on public.usage_monthly
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.recordings to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select on public.usage_monthly to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger items_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

create schema if not exists private;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'locale' = 'tr' then 'tr' else 'en' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

revoke all on function private.handle_new_user() from public, anon, authenticated;

-- Atomic quota. security invoker so the caller is the service role, which bypasses RLS.
-- Execute is granted only to service_role.
create or replace function public.consume_recording_quota(
  p_user_id uuid,
  p_is_pro boolean,
  p_period text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_count integer;
  lim integer;
begin
  if p_user_id is null then
    raise exception 'user required';
  end if;
  lim := case when p_is_pro then 300 else 25 end;

  insert into public.usage_monthly (user_id, period, recording_count)
  values (p_user_id, p_period, 0)
  on conflict (user_id, period) do nothing;

  select recording_count into current_count
  from public.usage_monthly
  where user_id = p_user_id and period = p_period
  for update;

  if current_count >= lim then
    return jsonb_build_object('allowed', false, 'count', current_count, 'limit', lim, 'is_pro', p_is_pro);
  end if;

  update public.usage_monthly
    set recording_count = recording_count + 1
    where user_id = p_user_id and period = p_period
    returning recording_count into current_count;

  return jsonb_build_object('allowed', true, 'count', current_count, 'limit', lim, 'is_pro', p_is_pro);
end;
$$;

create or replace function public.refund_recording_quota(p_user_id uuid, p_period text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.usage_monthly
    set recording_count = greatest(0, recording_count - 1)
    where user_id = p_user_id and period = p_period;
end;
$$;

revoke all on function public.consume_recording_quota(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.refund_recording_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_recording_quota(uuid, boolean, text) to service_role;
grant execute on function public.refund_recording_quota(uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  26214400,
  array['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/aac', 'audio/x-m4a']
)
on conflict (id) do nothing;

create policy recordings_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy recordings_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy recordings_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy recordings_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

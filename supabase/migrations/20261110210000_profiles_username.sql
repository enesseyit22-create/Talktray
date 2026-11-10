-- Public handle. Stored lower-case, unique, and only editable on the owner's row
-- (profiles_update already requires id = auth.uid()).

alter table public.profiles add column if not exists username text;

alter table public.profiles drop constraint if exists profiles_username_format;

alter table public.profiles
  add constraint profiles_username_format
  check (
    username is null
    or (username = lower(username) and username ~ '^[a-z0-9_.]{3,20}$')
  );

create unique index if not exists profiles_username_unique on public.profiles (username);

create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles
    where username = lower(coalesce(candidate, ''))
      and id is distinct from auth.uid()
  );
$$;

revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

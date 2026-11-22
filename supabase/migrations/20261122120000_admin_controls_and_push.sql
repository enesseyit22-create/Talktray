-- Admin controls and broadcasts. Apply this after the premium-push migration.
-- Push to everyone also needs the admin-push function redeployed, and each
-- phone to open the app once so it can store an Expo token.
-- Live presence already works through admin_active_users. This file only adds
-- a select policy and realtime so the list can refresh between polls.

alter table public.profiles
  add column if not exists blocked_at timestamptz;

create or replace function private.protect_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.blocked_at is distinct from old.blocked_at
    and not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_blocked() from public, anon, authenticated;

drop trigger if exists profiles_protect_blocked on public.profiles;
create trigger profiles_protect_blocked
  before update on public.profiles
  for each row
  execute function private.protect_blocked();

create or replace function public.admin_set_blocked(p_user_id uuid, p_blocked boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  until_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'USER_INVALID' using errcode = '22023';
  end if;
  until_at := case when p_blocked then now() else null end;
  update public.profiles
    set blocked_at = until_at
    where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return until_at;
end;
$$;

revoke all on function public.admin_set_blocked(uuid, boolean) from public, anon;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'USER_INVALID' using errcode = '22023';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.admin_blocked_users()
returns table (id uuid, blocked_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  return query
  select p.id, p.blocked_at
  from public.profiles p
  where p.blocked_at is not null;
end;
$$;

revoke all on function public.admin_blocked_users() from public, anon;
grant execute on function public.admin_blocked_users() to authenticated;

create or replace function public.admin_family_groups()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  return coalesce(
    (
      select jsonb_agg(row_to_json(g) order by g.created_at desc)
      from (
        select
          l.id,
          l.name,
          l.created_at,
          coalesce(nullif(p.username, ''), u.email::text, l.owner_id::text) as owner,
          (select count(*) from public.shared_list_members m where m.list_id = l.id) as members,
          (select count(*) from public.shared_list_items i where i.list_id = l.id) as items
        from public.shared_lists l
        join auth.users u on u.id = l.owner_id
        left join public.profiles p on p.id = l.owner_id
      ) g
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.admin_family_groups() from public, anon;
grant execute on function public.admin_family_groups() to authenticated;

create table if not exists public.user_push_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null,
  locale text,
  updated_at timestamptz not null default now()
);

alter table public.user_push_tokens enable row level security;
revoke all on table public.user_push_tokens from public, anon, authenticated;

create or replace function public.save_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean text := btrim(coalesce(p_token, ''));
  loc text;
begin
  if uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(clean) < 20 or length(clean) > 256 then
    raise exception 'invalid token' using errcode = '22023';
  end if;
  if clean not like 'ExponentPushToken[%' and clean not like 'ExpoPushToken[%' then
    raise exception 'invalid token' using errcode = '22023';
  end if;
  select p.locale into loc from public.profiles p where p.id = uid;
  insert into public.user_push_tokens (user_id, token, locale, updated_at)
  values (uid, clean, loc, now())
  on conflict (user_id) do update
    set token = excluded.token,
        locale = excluded.locale,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.save_push_token(text) from public, anon;
grant execute on function public.save_push_token(text) to authenticated;

-- Admins can subscribe to presence. Other accounts still see no rows.
drop policy if exists user_presence_admin_select on public.user_presence;
create policy user_presence_admin_select on public.user_presence
  for select to authenticated
  using (public.is_admin());

grant select on public.user_presence to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_presence'
  ) then
    execute 'alter publication supabase_realtime add table public.user_presence';
  end if;
end
$$;

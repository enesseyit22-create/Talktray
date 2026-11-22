-- Groups (friends, work, roommates) on top of shared lists.
-- A circle has members and its own lists. Joining a circle joins its lists.
-- Category is an optional label on a personal item. Older apps ignore the column.

alter table public.items
  add column if not exists category text;

alter table public.items
  drop constraint if exists items_category_check;

alter table public.items
  add constraint items_category_check
  check (category is null or category in ('shopping', 'work', 'home', 'health', 'personal', 'other'));

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  emoji text not null default '👥' check (char_length(emoji) between 1 and 8),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

alter table public.shared_lists
  add column if not exists circle_id uuid references public.circles (id) on delete cascade;

create index if not exists circle_members_user_idx on public.circle_members (user_id);
create index if not exists shared_lists_circle_idx on public.shared_lists (circle_id);

create or replace function private.is_circle_member(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = p_circle_id and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_circle_member(uuid) from public, anon;
grant execute on function private.is_circle_member(uuid) to authenticated;

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;

drop policy if exists circles_select on public.circles;
create policy circles_select on public.circles
  for select to authenticated
  using (private.is_circle_member(id));

drop policy if exists circle_members_select on public.circle_members;
create policy circle_members_select on public.circle_members
  for select to authenticated
  using (private.is_circle_member(circle_id));

revoke all on public.circles, public.circle_members from anon, authenticated;
grant select on public.circles, public.circle_members to authenticated;

-- Circle mates can open the group's lists even before they are copied onto every list.
drop policy if exists shared_lists_select on public.shared_lists;
create policy shared_lists_select on public.shared_lists
  for select to authenticated
  using (
    private.is_list_member(id)
    or (circle_id is not null and private.is_circle_member(circle_id))
  );

create or replace function private.attach_circle_member(p_circle_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  list record;
begin
  insert into public.circle_members (circle_id, user_id, display_name)
  values (
    p_circle_id,
    p_user_id,
    (select coalesce(nullif(btrim(display_name), ''), username) from public.profiles where id = p_user_id)
  )
  on conflict (circle_id, user_id) do nothing;

  for list in select id from public.shared_lists where circle_id = p_circle_id loop
    insert into public.shared_list_members (list_id, user_id, display_name)
    values (
      list.id,
      p_user_id,
      (select coalesce(nullif(btrim(display_name), ''), username) from public.profiles where id = p_user_id)
    )
    on conflict (list_id, user_id) do nothing;
  end loop;
end;
$$;

revoke all on function private.attach_circle_member(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_circle(p_name text, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  made public.circles;
  emoji text := btrim(coalesce(p_emoji, ''));
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if (select count(*) from public.circles where owner_id = uid) >= 10 then
    raise exception 'too many lists' using errcode = 'P0001';
  end if;
  if emoji = '' then
    emoji := '👥';
  end if;
  insert into public.circles (owner_id, name, emoji, invite_code)
  values (uid, btrim(coalesce(p_name, '')), emoji, private.new_invite_code())
  returning * into made;
  perform private.attach_circle_member(made.id, uid);
  return jsonb_build_object('id', made.id, 'name', made.name, 'emoji', made.emoji, 'invite_code', made.invite_code);
end;
$$;

create or replace function public.join_circle(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  made public.circles;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select * into made
  from public.circles
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if made.id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.circle_members where circle_id = made.id) >= 20 then
    raise exception 'too many members' using errcode = 'P0001';
  end if;
  perform private.attach_circle_member(made.id, uid);
  return jsonb_build_object('id', made.id, 'name', made.name, 'emoji', made.emoji, 'invite_code', made.invite_code);
end;
$$;

create or replace function public.leave_circle(p_circle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select owner_id into owner from public.circles where id = p_circle_id;
  if owner = uid then
    delete from public.circles where id = p_circle_id;
    return;
  end if;
  delete from public.shared_list_members
  where user_id = uid
    and list_id in (select id from public.shared_lists where circle_id = p_circle_id);
  delete from public.circle_members where circle_id = p_circle_id and user_id = uid;
end;
$$;

create or replace function public.remove_circle_member(p_circle_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.circles where id = p_circle_id and owner_id = uid) then
    raise exception 'not owner' using errcode = '42501';
  end if;
  if p_user_id = uid then
    raise exception 'USER_INVALID' using errcode = '22023';
  end if;
  delete from public.shared_list_members
  where user_id = p_user_id
    and list_id in (select id from public.shared_lists where circle_id = p_circle_id);
  delete from public.circle_members where circle_id = p_circle_id and user_id = p_user_id;
end;
$$;

create or replace function public.create_circle_list(p_circle_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  list public.shared_lists;
  member record;
begin
  if uid is null or not private.is_circle_member(p_circle_id) then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  insert into public.shared_lists (owner_id, name, invite_code, circle_id)
  values (uid, btrim(coalesce(p_name, '')), private.new_invite_code(), p_circle_id)
  returning * into list;
  for member in select user_id from public.circle_members where circle_id = p_circle_id loop
    insert into public.shared_list_members (list_id, user_id, display_name)
    values (
      list.id,
      member.user_id,
      (select coalesce(nullif(btrim(display_name), ''), username) from public.profiles where id = member.user_id)
    )
    on conflict (list_id, user_id) do nothing;
  end loop;
  return jsonb_build_object('id', list.id, 'name', list.name, 'invite_code', list.invite_code);
end;
$$;

revoke all on function public.create_circle(text, text) from public, anon;
revoke all on function public.join_circle(text) from public, anon;
revoke all on function public.leave_circle(uuid) from public, anon;
revoke all on function public.remove_circle_member(uuid, uuid) from public, anon;
revoke all on function public.create_circle_list(uuid, text) from public, anon;
grant execute on function public.create_circle(text, text) to authenticated;
grant execute on function public.join_circle(text) to authenticated;
grant execute on function public.leave_circle(uuid) to authenticated;
grant execute on function public.remove_circle_member(uuid, uuid) to authenticated;
grant execute on function public.create_circle_list(uuid, text) to authenticated;

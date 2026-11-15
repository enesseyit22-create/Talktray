-- Shared lists: a shopping (or any) list several accounts can see and tick off together.
--
-- Access rule: a list, its members, and its items are visible and editable only to
-- members. Lists are created, joined, and left only through the functions below
-- (security definer), never by direct inserts. Invite codes are 8 characters from a
-- 31-symbol alphabet. Limits: 10 owned lists per account, 10 members and 500 items per list.

create schema if not exists private;

create table if not exists public.shared_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_list_members (
  list_id uuid not null references public.shared_lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table if not exists public.shared_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shared_lists (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  added_by uuid references auth.users (id) on delete set null,
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shared_list_members_user_idx on public.shared_list_members (user_id);
create index if not exists shared_list_items_list_idx on public.shared_list_items (list_id, created_at);

-- Membership check outside RLS, so policies on the members table do not recurse.
create or replace function private.is_list_member(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shared_list_members
    where list_id = p_list_id and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_list_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_list_member(uuid) to authenticated;

alter table public.shared_lists enable row level security;
alter table public.shared_list_members enable row level security;
alter table public.shared_list_items enable row level security;

drop policy if exists shared_lists_select on public.shared_lists;
create policy shared_lists_select on public.shared_lists
  for select to authenticated
  using (private.is_list_member(id));

drop policy if exists shared_list_members_select on public.shared_list_members;
create policy shared_list_members_select on public.shared_list_members
  for select to authenticated
  using (private.is_list_member(list_id));

drop policy if exists shared_list_items_select on public.shared_list_items;
create policy shared_list_items_select on public.shared_list_items
  for select to authenticated
  using (private.is_list_member(list_id));

drop policy if exists shared_list_items_insert on public.shared_list_items;
create policy shared_list_items_insert on public.shared_list_items
  for insert to authenticated
  with check (private.is_list_member(list_id));

drop policy if exists shared_list_items_update on public.shared_list_items;
create policy shared_list_items_update on public.shared_list_items
  for update to authenticated
  using (private.is_list_member(list_id))
  with check (private.is_list_member(list_id));

drop policy if exists shared_list_items_delete on public.shared_list_items;
create policy shared_list_items_delete on public.shared_list_items
  for delete to authenticated
  using (private.is_list_member(list_id));

revoke all on public.shared_lists, public.shared_list_members, public.shared_list_items from anon, authenticated;
grant select on public.shared_lists, public.shared_list_members to authenticated;
grant select, delete on public.shared_list_items to authenticated;
grant insert (id, list_id, title) on public.shared_list_items to authenticated;
grant update (title, done_at) on public.shared_list_items to authenticated;

-- Who added and who ticked an item come from the session, not the client. Items stay in their list.
create or replace function private.shared_item_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := (select auth.uid());
    new.done_at := null;
    new.done_by := null;
    new.created_at := now();
    if (select count(*) from public.shared_list_items where list_id = new.list_id) >= 500 then
      raise exception 'list is full' using errcode = 'P0001';
    end if;
  else
    new.list_id := old.list_id;
    new.added_by := old.added_by;
    new.created_at := old.created_at;
    if new.done_at is distinct from old.done_at then
      new.done_by := case when new.done_at is null then null else (select auth.uid()) end;
    else
      new.done_by := old.done_by;
    end if;
  end if;
  new.title := btrim(new.title);
  return new;
end;
$$;

drop trigger if exists shared_item_stamp on public.shared_list_items;
create trigger shared_item_stamp
  before insert or update on public.shared_list_items
  for each row execute function private.shared_item_stamp();

create or replace function private.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.shared_lists where invite_code = code);
  end loop;
  return code;
end;
$$;

revoke all on function private.new_invite_code() from public, anon, authenticated;

create or replace function public.create_shared_list(p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  list public.shared_lists;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if (select count(*) from public.shared_lists where owner_id = uid) >= 10 then
    raise exception 'too many lists' using errcode = 'P0001';
  end if;
  insert into public.shared_lists (owner_id, name, invite_code)
  values (uid, btrim(coalesce(p_name, '')), private.new_invite_code())
  returning * into list;
  insert into public.shared_list_members (list_id, user_id, display_name)
  values (list.id, uid, (select coalesce(nullif(btrim(display_name), ''), username) from public.profiles where id = uid));
  return jsonb_build_object('id', list.id, 'name', list.name, 'invite_code', list.invite_code);
end;
$$;

create or replace function public.join_shared_list(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  list public.shared_lists;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select * into list
  from public.shared_lists
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if list.id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.shared_list_members where list_id = list.id and user_id = uid) then
    if (select count(*) from public.shared_list_members where list_id = list.id) >= 10 then
      raise exception 'list has too many members' using errcode = 'P0001';
    end if;
    insert into public.shared_list_members (list_id, user_id, display_name)
    values (list.id, uid, (select coalesce(nullif(btrim(display_name), ''), username) from public.profiles where id = uid));
  end if;
  return jsonb_build_object('id', list.id, 'name', list.name);
end;
$$;

-- A member leaves. When the owner leaves, the list is deleted for everyone.
create or replace function public.leave_shared_list(p_list_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.shared_lists where id = p_list_id and owner_id = uid) then
    delete from public.shared_lists where id = p_list_id;
  else
    delete from public.shared_list_members where list_id = p_list_id and user_id = uid;
  end if;
end;
$$;

-- The owner makes a fresh code, so an old invite stops working.
create or replace function public.rotate_shared_list_code(p_list_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  code text;
begin
  if not exists (select 1 from public.shared_lists where id = p_list_id and owner_id = uid) then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  code := private.new_invite_code();
  update public.shared_lists set invite_code = code where id = p_list_id;
  return code;
end;
$$;

revoke all on function public.create_shared_list(text) from public, anon;
revoke all on function public.join_shared_list(text) from public, anon;
revoke all on function public.leave_shared_list(uuid) from public, anon;
revoke all on function public.rotate_shared_list_code(uuid) from public, anon;
grant execute on function public.create_shared_list(text) to authenticated;
grant execute on function public.join_shared_list(text) to authenticated;
grant execute on function public.leave_shared_list(uuid) to authenticated;
grant execute on function public.rotate_shared_list_code(uuid) to authenticated;

-- Live updates on open phones. RLS still decides who receives each change.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_list_items'
  ) then
    execute 'alter publication supabase_realtime add table public.shared_list_items';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_list_members'
  ) then
    execute 'alter publication supabase_realtime add table public.shared_list_members';
  end if;
end
$$;

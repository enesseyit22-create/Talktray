-- Supabase now blocks direct deletes from storage.objects (storage.protect_delete),
-- so the old delete_own_account raised and no account could be deleted.
-- The app removes the user's audio through the Storage API first; this function
-- removes the account, and every table row goes with it by cascade.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

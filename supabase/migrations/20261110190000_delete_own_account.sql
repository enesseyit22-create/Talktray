-- In-app account deletion. Cascades remove profile, recordings, items, and usage.
-- Storage objects in the private recordings bucket are removed first.

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

  delete from storage.objects
  where bucket_id = 'recordings'
    and (storage.foldername(name))[1] = uid::text;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

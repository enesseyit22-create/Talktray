-- Allow the ten shipped app locales on profiles, including sign-up metadata.

alter table public.profiles drop constraint if exists profiles_locale_check;

alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('en', 'tr', 'es', 'pt-BR', 'de', 'fr', 'it', 'ja', 'ko', 'id'));

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := new.raw_user_meta_data ->> 'locale';
  chosen text := 'en';
begin
  if requested in ('en', 'tr', 'es', 'pt-BR', 'de', 'fr', 'it', 'ja', 'ko', 'id') then
    chosen := requested;
  elsif requested ilike 'pt%' then
    chosen := 'pt-BR';
  end if;

  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    chosen
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

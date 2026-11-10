-- Default lead times live on the profile. Null on an item means "use the profile default".
-- 0 is at the due time. Other values are minutes before.

alter table public.profiles
  add column if not exists reminder_offsets integer[] not null default '{0}';

alter table public.items
  add column if not exists reminder_offsets integer[];

alter table public.profiles drop constraint if exists profiles_reminder_offsets_check;
alter table public.profiles
  add constraint profiles_reminder_offsets_check
  check (reminder_offsets <@ array[0, 5, 10, 15, 30, 60, 1440]::integer[] and cardinality(reminder_offsets) > 0);

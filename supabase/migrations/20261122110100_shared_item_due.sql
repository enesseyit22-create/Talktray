-- Optional due time on a shared list item. Every member's phone schedules a
-- local reminder for it. No new push token and no native permission.

alter table public.shared_list_items
  add column if not exists due_at timestamptz;

create index if not exists shared_list_items_due_idx
  on public.shared_list_items (due_at)
  where due_at is not null and done_at is null;

grant update (due_at) on public.shared_list_items to authenticated;

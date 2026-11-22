-- Repeating items (Pro). Finishing one moves due_at to the next occurrence instead of completing it.
alter table public.items
  add column if not exists repeat text
  check (repeat is null or repeat in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly'));

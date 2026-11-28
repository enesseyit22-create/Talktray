-- Covering indexes for foreign keys the advisor flagged. Owner and member lookups, and deletes of a user, use them.
create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);
create index if not exists circles_owner_idx on public.circles (owner_id);
create index if not exists shared_list_items_added_by_idx on public.shared_list_items (added_by);
create index if not exists shared_list_items_done_by_idx on public.shared_list_items (done_by);
create index if not exists shared_lists_owner_idx on public.shared_lists (owner_id);

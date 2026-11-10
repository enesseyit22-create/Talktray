-- Lock the trigger helper's search_path and index the items.recording_id foreign key.
-- Already applied on the live database; this migration keeps the repo in sync.

alter function public.set_updated_at() set search_path = '';

create index if not exists items_recording_id_idx on public.items(recording_id);

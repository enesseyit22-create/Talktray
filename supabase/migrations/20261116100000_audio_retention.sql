-- Audio retention: free accounts keep a take's audio 7 days, Pro 30 days.
-- The purge-audio edge function deletes the files through the Storage API and clears
-- recordings.storage_path; transcripts and saved items stay.
--
-- pg_cron calls it once a day. The call carries a shared secret read from Vault
-- (name: purge_audio_secret). The same value is the function's PURGE_SECRET.
-- Neither value is stored in this repository. To set them up on a new project:
--   select vault.create_secret('<random>', 'purge_audio_secret');
--   supabase secrets set PURGE_SECRET=<same random>

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-audio-daily') then
    perform cron.unschedule('purge-audio-daily');
  end if;
end
$$;

select cron.schedule(
  'purge-audio-daily',
  '17 3 * * *',
  $job$
  select net.http_post(
    url := 'https://ggcubezrrnplpdyfvzhe.supabase.co/functions/v1/purge-audio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purge_audio_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

import { supabase } from '@/lib/supabase';

const BUCKET = 'recordings';
const PAGE = 100;

/**
 * Deletes every audio file in the user's folder through the Storage API (direct deletes from
 * storage tables are blocked). Lists and removes a page at a time until the folder is empty,
 * so accounts with more than 100 files are cleared too. Throws if a page cannot be removed.
 */
export async function removeAllAudio(userId: string): Promise<void> {
  for (let round = 0; round < 200; round++) {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: PAGE });
    if (error) throw error;
    const paths = (data ?? []).filter((file) => file.name && file.id !== null).map((file) => `${userId}/${file.name}`);
    if (!paths.length) return;
    const removed = await supabase.storage.from(BUCKET).remove(paths);
    if (removed.error) throw removed.error;
  }
}

/** Removes one audio file. Missing files are fine. */
export async function removeAudio(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

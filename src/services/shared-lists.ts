import { SEED_COPY } from '@/data/seed-copy';
import { asLocale } from '@/i18n/locale';
import { supabase } from '@/lib/supabase';

export type SharedList = {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
};

export type SharedMember = {
  userId: string;
  displayName: string | null;
};

export type SharedItem = {
  id: string;
  listId: string;
  title: string;
  addedBy: string | null;
  doneAt: string | null;
  doneBy: string | null;
  createdAt: string;
};

/** Codes use letters and digits that are hard to confuse. Spaces and dashes are ignored. */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
}

/** "ABCD2345" → "ABCD-2345", easier to read aloud or type. */
export function formatInviteCode(code: string): string {
  const clean = normalizeInviteCode(code);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export function inviteLink(code: string): string {
  return `talktray://join?code=${normalizeInviteCode(code)}`;
}

/** Undone first (oldest first, like a list on paper), then done (latest first). */
export function sortSharedItems(items: SharedItem[]): SharedItem[] {
  const open = items.filter((item) => !item.doneAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const done = items.filter((item) => item.doneAt).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return [...open, ...done];
}

export type SharedListError = 'not_found' | 'full' | 'too_many' | 'network';

/** Maps database errors from the shared-list functions to something the screen can explain. */
export function sharedListError(error: { message?: string; code?: string } | null | undefined): SharedListError {
  const message = (error?.message ?? '').toLowerCase();
  if (error?.code === 'P0002' || message.includes('invite not found')) return 'not_found';
  if (message.includes('too many members') || message.includes('list is full')) return 'full';
  if (message.includes('too many lists')) return 'too_many';
  return 'network';
}

function mapList(row: Record<string, unknown>): SharedList {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    ownerId: String(row.owner_id ?? ''),
    inviteCode: String(row.invite_code ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapItem(row: Record<string, unknown>): SharedItem {
  return {
    id: String(row.id),
    listId: String(row.list_id),
    title: String(row.title ?? ''),
    addedBy: (row.added_by as string | null) ?? null,
    doneAt: (row.done_at as string | null) ?? null,
    doneBy: (row.done_by as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

/** Store screenshots only (EXPO_PUBLIC_PREVIEW=1): a sample shared list in the preview language. */
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';

function previewList(locale?: string): { list: SharedList; members: SharedMember[]; items: SharedItem[] } {
  const copy = SEED_COPY[asLocale(locale || process.env.EXPO_PUBLIC_PREVIEW_LOCALE)] ?? SEED_COPY.en;
  const now = Date.now();
  const stamp = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const ids = ['preview', 'p2', 'p3'];
  return {
    list: { id: 'preview', name: copy.shared.name, ownerId: 'preview', inviteCode: 'K7MPQ2XA', createdAt: stamp(5000) },
    members: copy.shared.members.map((name, index) => ({ userId: ids[index]!, displayName: name })),
    items: copy.shared.items.map((title, index) => ({
      id: `s${index}`,
      listId: 'preview',
      title,
      addedBy: ids[index % 3]!,
      doneAt: index >= 3 ? stamp(20 + index) : null,
      doneBy: index >= 3 ? ids[(index + 1) % 3]! : null,
      createdAt: stamp(300 - index * 10),
    })),
  };
}

export async function loadSharedLists(previewLocale?: string): Promise<SharedList[]> {
  if (PREVIEW) return [previewList(previewLocale).list];
  const { data, error } = await supabase.from('shared_lists').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapList);
}

export async function loadSharedList(listId: string, previewLocale?: string): Promise<{
  list: SharedList | null;
  members: SharedMember[];
  items: SharedItem[];
}> {
  if (PREVIEW) return previewList(previewLocale);
  const [list, members, items] = await Promise.all([
    supabase.from('shared_lists').select('*').eq('id', listId).maybeSingle(),
    supabase.from('shared_list_members').select('user_id, display_name').eq('list_id', listId),
    supabase.from('shared_list_items').select('*').eq('list_id', listId).order('created_at', { ascending: true }),
  ]);
  if (list.error) throw list.error;
  if (items.error) throw items.error;
  return {
    list: list.data ? mapList(list.data) : null,
    members: (members.data ?? []).map((row) => ({
      userId: String(row.user_id),
      displayName: (row.display_name as string | null) ?? null,
    })),
    items: (items.data ?? []).map(mapItem),
  };
}

export async function createSharedList(name: string): Promise<{ id: string; inviteCode: string }> {
  const { data, error } = await supabase.rpc('create_shared_list', { p_name: name.trim() });
  if (error) throw error;
  const row = data as { id: string; invite_code: string };
  return { id: row.id, inviteCode: row.invite_code };
}

export async function joinSharedList(code: string): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase.rpc('join_shared_list', { p_code: normalizeInviteCode(code) });
  if (error) throw error;
  return data as { id: string; name: string };
}

export async function leaveSharedList(listId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_shared_list', { p_list_id: listId });
  if (error) throw error;
}

export async function rotateInviteCode(listId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_shared_list_code', { p_list_id: listId });
  if (error) throw error;
  return String(data);
}

export async function addSharedItem(listId: string, id: string, title: string): Promise<SharedItem> {
  const { data, error } = await supabase
    .from('shared_list_items')
    .insert({ id, list_id: listId, title: title.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return mapItem(data);
}

export async function setSharedItemDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from('shared_list_items')
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSharedItem(id: string): Promise<void> {
  const { error } = await supabase.from('shared_list_items').delete().eq('id', id);
  if (error) throw error;
}

/** Ticks finished items off the list for everyone. */
export async function clearDoneSharedItems(listId: string): Promise<void> {
  const { error } = await supabase.from('shared_list_items').delete().eq('list_id', listId).not('done_at', 'is', null);
  if (error) throw error;
}

/** Live changes from other members. The screen also re-reads on focus in case realtime is quiet. */
export function subscribeSharedList(listId: string, onChange: () => void): () => void {
  if (PREVIEW) return () => undefined;
  const channel = supabase
    .channel(`shared-list-${listId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shared_list_items', filter: `list_id=eq.${listId}` },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shared_list_members', filter: `list_id=eq.${listId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

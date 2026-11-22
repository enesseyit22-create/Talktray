import { supabase } from '@/lib/supabase';
import { normalizeInviteCode } from '@/services/shared-lists';

export type Circle = {
  id: string;
  name: string;
  emoji: string;
  ownerId: string;
  inviteCode: string;
};

function mapCircle(row: Record<string, unknown>): Circle {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    emoji: String(row.emoji ?? '👥'),
    ownerId: String(row.owner_id ?? ''),
    inviteCode: String(row.invite_code ?? ''),
  };
}

export async function loadCircles(): Promise<Circle[]> {
  const { data, error } = await supabase.from('circles').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapCircle(row as Record<string, unknown>));
}

export async function createCircle(name: string, emoji: string): Promise<Circle> {
  const { data, error } = await supabase.rpc('create_circle', { p_name: name.trim(), p_emoji: emoji.trim() || '👥' });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  return { id: String(row.id), name: String(row.name), emoji: String(row.emoji), ownerId: '', inviteCode: String(row.invite_code) };
}

export async function joinCircle(code: string): Promise<void> {
  const { error } = await supabase.rpc('join_circle', { p_code: normalizeInviteCode(code) });
  if (error) throw error;
}

export async function leaveCircle(id: string): Promise<void> {
  const { error } = await supabase.rpc('leave_circle', { p_circle_id: id });
  if (error) throw error;
}

export async function createCircleList(circleId: string, name: string): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('create_circle_list', { p_circle_id: circleId, p_name: name });
  if (error) throw error;
  return { id: String((data as { id: string }).id) };
}

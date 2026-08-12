import { supabase } from '@/lib/supabase';

export type AuditLogEntityType =
  | 'user'
  | 'tournament'
  | 'tournament_team'
  | 'tournament_match'
  | 'tournament_playoff_match';

export type AuditLogEntry = {
  id: string;
  actor_id: string;
  actor_nick: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function mapAuditLogRow(raw: Record<string, unknown>): AuditLogEntry {
  return {
    id: String(raw.id ?? ''),
    actor_id: String(raw.actor_id ?? ''),
    actor_nick: typeof raw.actor_nick === 'string' ? raw.actor_nick : null,
    action: typeof raw.action === 'string' ? raw.action : '',
    entity_type: typeof raw.entity_type === 'string' ? raw.entity_type : '',
    entity_id: typeof raw.entity_id === 'string' ? raw.entity_id : null,
    metadata: (raw.metadata as Record<string, unknown> | null) ?? {},
    created_at: String(raw.created_at ?? ''),
  };
}

export async function getAuditLog(
  entityType: AuditLogEntityType | null,
  limit = 50,
): Promise<{ data: AuditLogEntry[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('admin_list_audit_log', {
    p_entity_type: entityType,
    p_limit: limit,
  });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapAuditLogRow),
    error: null,
  };
}

import { supabase } from '@/lib/supabase';

/**
 * Rodzaje interakcji zbieranych pod przyszły system rekomendacji
 * (feed „Dla Ciebie", podpowiedzi wydarzeń/drużyn/osób).
 */
export type InteractionKind =
  | 'view_event'
  | 'join_event'
  | 'save_event'
  | 'search_category'
  | 'view_team'
  | 'join_team'
  | 'like_post'
  | 'open_profile';

type InteractionInput = {
  kind: InteractionKind;
  eventId?: string | null;
  teamId?: string | null;
  category?: string | null;
  subcategory?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Zapisuje interakcję użytkownika (fire-and-forget).
 * Nigdy nie rzuca błędem — analityka nie może blokować UX.
 */
export async function logInteraction(input: InteractionInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;

    await supabase.from('user_interactions').insert({
      user_id: userId,
      kind: input.kind,
      event_id: input.eventId ?? null,
      team_id: input.teamId ?? null,
      category: input.category ?? null,
      subcategory: input.subcategory ?? null,
      metadata: input.metadata ?? null,
    });
  } catch {
    // celowo ignorujemy — logowanie interakcji jest best-effort
  }
}

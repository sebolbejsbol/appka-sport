import { t } from '@/i18n';

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
};

export function isMissingEventFilterColumnsError(error: SupabaseErrorLike | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST204' ||
    msg.includes('skill_level') ||
    msg.includes('event_type') ||
    msg.includes('payment_status') ||
    msg.includes('visibility') ||
    msg.includes('schema cache')
  );
}

export function mapEventMutationError(
  error: SupabaseErrorLike | null,
  action: 'create' | 'update' = 'create',
): string {
  if (!error) {
    return action === 'update' ? t('event.errors.updateFailed') : t('event.errors.createFailed');
  }

  const msg = (error.message ?? '').toLowerCase();
  const fallback =
    action === 'update' ? t('event.errors.updateFailed') : t('event.errors.createFailed');

  if (msg.includes('daily_event_limit')) {
    return t('event.errors.dailyLimit');
  }
  if (isMissingEventFilterColumnsError(error)) {
    return t('event.errors.migrationMissing0024');
  }
  if (msg.includes('events_title_length') || msg.includes('title')) {
    return t('event.errors.titleTooLong');
  }
  if (msg.includes('events_notes_length') || msg.includes('notes')) {
    return t('event.errors.notesTooLong');
  }
  if (msg.includes('duration_min') || msg.includes('duration')) {
    return t('event.errors.durationInvalid');
  }
  if (msg.includes('max_players')) {
    return t('event.errors.maxPlayersInvalid');
  }
  if (msg.includes('foreign key') && msg.includes('field')) {
    return t('event.errors.fieldNotFound');
  }
  if (msg.includes('row-level security') || msg.includes('permission') || error.code === '42501') {
    return t('event.errors.notAuthenticated');
  }

  return fallback;
}

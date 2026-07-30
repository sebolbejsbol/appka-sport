import { t } from '@/i18n';

/** Tłumaczy błąd Supabase przy operacjach na drużynach. */
export function mapTeamError(message: string | undefined): string {
  if (!message) {
    return t('teams.createError');
  }

  const lower = message.toLowerCase();

  if (
    lower.includes('create_team') ||
    lower.includes('list_my_teams') ||
    lower.includes('pgrst202') ||
    lower.includes('42883') ||
    lower.includes('does not exist')
  ) {
    return t('teams.migrationMissing');
  }

  if (lower.includes('not_authenticated') || lower.includes('jwt')) {
    return t('teams.notAuthenticated');
  }

  if (lower.includes('invalid_name')) {
    return t('teams.invalidName');
  }

  if (lower.includes('column "kind"') || lower.includes('relation "public.teams"')) {
    return t('teams.migrationMissing');
  }

  return t('teams.createErrorDetail').replace('{detail}', message);
}

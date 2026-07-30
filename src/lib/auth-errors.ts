import type { AuthError } from '@supabase/supabase-js';

import { t } from '@/i18n';

/**
 * Zamienia techniczny (angielski) błąd z Supabase na zrozumiały komunikat po polsku.
 * Gdy nie rozpoznajemy błędu, pokazujemy ogólny komunikat.
 */
export function mapAuthError(error: AuthError): string {
  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return t('errors.invalidCredentials');
  }
  if (message.includes('nick_taken')) {
    return t('errors.nickTaken');
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return t('errors.emailTaken');
  }
  if (message.includes('email not confirmed')) {
    return t('errors.emailNotConfirmed');
  }
  if (message.includes('weak password') || message.includes('password is too weak')) {
    return t('errors.weakPassword');
  }
  if (message.includes('signup is disabled') || message.includes('signups not allowed')) {
    return t('errors.signupDisabled');
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return t('errors.emailRateLimited');
  }
  if (message.includes('network') || message.includes('failed to fetch')) {
    return t('errors.network');
  }

  return t('errors.generic');
}

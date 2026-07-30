import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { FieldRatingPromptModal } from '@/components/field-rating-prompt-modal';
import { useSession } from '@/context/session';
import {
  markFieldRatingPromptHandled,
  wasFieldRatingPromptHandled,
} from '@/lib/field-rating-prompt-storage';
import {
  getMyEventsPendingFieldRating,
  type PendingFieldRatingEvent,
} from '@/lib/pending-field-ratings';

export function FieldRatingPromptHost() {
  const { session } = useSession();
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<PendingFieldRatingEvent | null>(null);
  const checkingRef = useRef(false);

  const checkForPrompt = useCallback(async () => {
    if (!session?.user?.id || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const { data } = await getMyEventsPendingFieldRating(1);
      const next = data[0];
      if (!next) return;

      const onSameEventScreen = pathname === `/event/${next.event_id}`;
      if (onSameEventScreen) return;

      if (await wasFieldRatingPromptHandled(next.event_id)) return;

      await markFieldRatingPromptHandled(next.event_id);
      setPrompt(next);
    } finally {
      checkingRef.current = false;
    }
  }, [pathname, session?.user?.id]);

  useEffect(() => {
    void checkForPrompt();
  }, [checkForPrompt]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void checkForPrompt();
    });
    return () => sub.remove();
  }, [checkForPrompt]);

  if (!prompt) return null;

  return (
    <FieldRatingPromptModal
      visible
      eventId={prompt.event_id}
      fieldName={prompt.field_name}
      eventTitle={prompt.title}
      initialRating={null}
      onClose={() => setPrompt(null)}
      onSubmitted={() => setPrompt(null)}
    />
  );
}

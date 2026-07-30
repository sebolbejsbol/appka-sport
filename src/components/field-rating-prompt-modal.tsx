import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventFieldRatingForm } from '@/components/event-field-rating-form';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { formatCourtName } from '@/lib/field-display';
import type { EventFieldRating } from '@/lib/field-ratings';

type Props = {
  visible: boolean;
  eventId: string;
  fieldName: string | null;
  eventTitle: string | null;
  initialRating: EventFieldRating | null;
  onClose: () => void;
  onSubmitted: () => void;
};

export function FieldRatingPromptModal({
  visible,
  eventId,
  fieldName,
  eventTitle,
  initialRating,
  onClose,
  onSubmitted,
}: Props) {
  const insets = useSafeAreaInsets();
  const court = formatCourtName(fieldName);
  const titlePreview = eventTitle?.trim();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('fieldRatings.promptTitle')}</Text>
          <Text style={styles.subtitle}>{t('fieldRatings.promptSubtitle')}</Text>
          <Text style={styles.court}>{court}</Text>
          {titlePreview ? <Text style={styles.eventTitle}>{titlePreview}</Text> : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <EventFieldRatingForm
              eventId={eventId}
              initialRating={initialRating}
              onSubmitted={onSubmitted}
              embedded
            />
          </ScrollView>

          <Pressable onPress={onClose} style={styles.skipBtn}>
            <Text style={styles.skipText}>{t('fieldRatings.promptSkip')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: Brand.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: Brand.border,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Brand.textSecondary,
    marginTop: 6,
    marginBottom: 10,
  },
  court: {
    fontSize: 16,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  eventTitle: {
    fontSize: 14,
    color: Brand.textMuted,
    marginTop: 2,
    marginBottom: 8,
  },
  scroll: {
    flexGrow: 0,
    maxHeight: 420,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  skipBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textMuted,
  },
});

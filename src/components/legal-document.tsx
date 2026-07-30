import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import type { LegalDocument } from '@/content/legal/types';

type Props = {
  document: LegalDocument;
  onClose: () => void;
};

/**
 * Pełnoekranowy widok dokumentu prawnego (regulamin / polityka). Pokazywany jako modal
 * przez <LegalDocumentHost />, więc nie jest trasą nawigacji — „wstecz" zawsze zamyka modal.
 */
export function LegalDocumentView({ document, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{document.title}</Text>
        <Text style={styles.updated}>
          {t('legal.updatedAt')}: {document.updatedAt}
        </Text>

        {document.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph, index) => (
              <Text key={`${section.title}-${index}`} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f6f6',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#f6f6f6',
    zIndex: 10,
    elevation: 4,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 16,
    color: Brand.textSecondary,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Brand.textSecondary,
    marginBottom: 4,
  },
  updated: {
    fontSize: 11,
    color: Brand.textMuted,
    marginBottom: 20,
  },
  section: {
    marginBottom: 16,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  paragraph: {
    fontSize: 12,
    lineHeight: 17,
    color: Brand.textMuted,
    textAlign: 'justify',
  },
});

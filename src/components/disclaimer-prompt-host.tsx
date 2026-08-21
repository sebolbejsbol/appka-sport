import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import { hasSeenDisclaimer, markDisclaimerSeen } from '@/lib/disclaimer-storage';
import { openLegalDocument } from '@/lib/legal-navigation';

const POINTS: { emoji: string; titleKey: Parameters<typeof t>[0]; bodyKey: Parameters<typeof t>[0] }[] = [
  { emoji: '🎂', titleKey: 'disclaimer.pointAgeTitle', bodyKey: 'disclaimer.pointAgeBody' },
  { emoji: '⚠️', titleKey: 'disclaimer.pointRiskTitle', bodyKey: 'disclaimer.pointRiskBody' },
  { emoji: '🤝', titleKey: 'disclaimer.pointMeetTitle', bodyKey: 'disclaimer.pointMeetBody' },
];

/**
 * Jednorazowe, ładne przypomnienie po pierwszym zalogowaniu:
 * aplikacja jest 16+ i korzystanie odbywa się na własną odpowiedzialność.
 * Stan „widziane" trzymamy lokalnie (AsyncStorage), więc pokazuje się raz na urządzeniu.
 */
export function DisclaimerPromptHost() {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!session?.user?.id || checkedRef.current) return;
    checkedRef.current = true;
    void hasSeenDisclaimer().then((seen) => {
      if (!seen) setVisible(true);
    });
  }, [session?.user?.id]);

  const accept = () => {
    setVisible(false);
    void markDisclaimerSeen();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={accept}>
      <View style={styles.backdrop}>
        <View style={[styles.card, styles.cardMax]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            bounces={false}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('disclaimer.badge')}</Text>
            </View>

            <Text style={styles.title}>{t('disclaimer.title')}</Text>
            <Text style={styles.intro}>{t('disclaimer.intro')}</Text>

            <View style={styles.points}>
              {POINTS.map((p) => (
                <View key={p.titleKey} style={styles.point}>
                  <Text style={styles.pointEmoji}>{p.emoji}</Text>
                  <View style={styles.pointText}>
                    <Text style={styles.pointTitle}>{t(p.titleKey)}</Text>
                    <Text style={styles.pointBody}>{t(p.bodyKey)}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              onPress={() => openLegalDocument('terms', '/')}
              hitSlop={6}
              style={styles.termsBtn}>
              <Text style={styles.termsText}>{t('disclaimer.terms')} ›</Text>
            </Pressable>
          </ScrollView>

          <Pressable
            onPress={accept}
            style={({ pressed }) => [
              styles.accept,
              { marginBottom: insets.bottom > 0 ? 4 : 0 },
              pressed && styles.pressed,
            ]}>
            <Text style={styles.acceptText}>{t('disclaimer.accept')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: Brand.screenBackground,
    borderRadius: 24,
    padding: 22,
    ...shadow('lg'),
  },
  cardMax: {
    maxHeight: '85%',
  },
  scroll: {
    paddingBottom: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primary,
  },
  badgeText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 14,
    fontWeight: '900',
    color: Brand.primaryText,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: BrandFonts.display,
    fontSize: 24,
    fontWeight: '900',
    color: Brand.textPrimary,
    marginTop: 14,
  },
  intro: {
    fontFamily: BrandFonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: Brand.textSecondary,
    marginTop: 6,
  },
  points: {
    marginTop: 18,
    gap: 14,
  },
  point: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  pointEmoji: {
    fontSize: 24,
  },
  pointText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  pointTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    fontWeight: '800',
    color: Brand.textPrimary,
  },
  pointBody: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: Brand.textSecondary,
  },
  termsBtn: {
    alignSelf: 'center',
    paddingVertical: 14,
    marginTop: 6,
  },
  termsText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 14,
    fontWeight: '700',
    color: Brand.primary,
  },
  accept: {
    marginTop: 4,
    backgroundColor: Brand.primary,
    borderRadius: Radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow('sm'),
  },
  acceptText: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.primaryText,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.9,
  },
});

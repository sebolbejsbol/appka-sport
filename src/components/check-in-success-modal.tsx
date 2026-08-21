import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckCircleIcon } from '@/components/icons';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { divisionName, divisionProgress } from '@/lib/ranking';

type Props = {
  visible: boolean;
  /** XP przed i po zameldowaniu — realna delta, nie stała, bo serwer decyduje ile przyznać. */
  xpBefore: number;
  xpAfter: number;
  onClose: () => void;
};

export function CheckInSuccessModal({ visible, xpBefore, xpAfter, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const gained = Math.max(0, xpAfter - xpBefore);
  const { division, next, progress, xpToNext } = divisionProgress(xpAfter);

  const progressNote = next
    ? t('ranking.nextDivision')
        .replace('{name}', divisionName(next))
        .replace('{xp}', String(xpToNext))
    : t('ranking.maxDivision');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />

          <View style={styles.titleRow}>
            <View style={styles.checkBadge}>
              <CheckCircleIcon size={18} color={Brand.pitch} strokeWidth={2.4} />
            </View>
            <Text style={styles.title}>{t('event.checkInSuccessTitle')}</Text>
          </View>

          {gained > 0 ? (
            <>
              <View style={styles.xpRow}>
                <Text style={styles.xpValue}>+{gained}</Text>
                <Text style={styles.xpLabel}>{t('event.checkInXpLabel')}</Text>
              </View>

              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{t('event.checkInYourXp')}</Text>
                <Text style={styles.totalsValue}>
                  {xpBefore} → {xpAfter}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.pendingRow}>
              <Text style={styles.pendingText}>{t('event.checkInXpPending')}</Text>
            </View>
          )}

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress * 100)}%`, backgroundColor: division.color },
              ]}
            />
          </View>
          <Text style={styles.progressNote}>{progressNote}</Text>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <Text style={styles.ctaText}>{t('event.checkInContinue')}</Text>
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
    backgroundColor: 'rgba(10,14,22,0.5)',
  },
  sheet: {
    backgroundColor: Brand.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 10,
    ...shadow('lg'),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: Brand.border,
    marginBottom: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkBadge: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: Brand.pitchLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 17,
    color: Brand.textPrimary,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingVertical: 16,
    marginTop: 14,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: Brand.divider,
  },
  xpValue: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 34,
    color: Brand.amber,
    letterSpacing: -0.4,
  },
  xpLabel: {
    fontFamily: BrandFonts.monoMedium,
    fontSize: 14,
    color: Brand.textMuted,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  totalsLabel: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textMuted,
  },
  totalsValue: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 14,
    color: Brand.textPrimary,
  },
  pendingRow: {
    paddingVertical: 16,
    marginTop: 14,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: Brand.divider,
  },
  pendingText: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textSecondary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Brand.surfaceMuted,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressNote: {
    fontFamily: BrandFonts.body,
    fontSize: 12.5,
    color: Brand.textMuted,
    marginTop: 8,
  },
  cta: {
    marginTop: 20,
    backgroundColor: Brand.primary,
    borderRadius: Radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadow('sm'),
  },
  ctaText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.9,
  },
});

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { t } from '@/i18n';

type Props = {
  /** 0-based index of the current step. */
  stepIndex: number;
  stepCount: number;
  stepTitle?: string;
  stepHint?: string;
  onBack: () => void;
  onNext: () => void;
  /** Overrides the default "Dalej" label — e.g. "Utwórz" on the final step. */
  nextLabel?: string;
  nextDisabled?: boolean;
  children: ReactNode;
};

/**
 * Generyczny stepper krok-po-kroku: kropki postępu + treść kroku + stopka
 * Wstecz/Dalej. Współdzielony przez kreator turnieju (admin) i kreator
 * drużyny turniejowej (gracz) — żadnej z tych dwóch domen nie dotyczy, cała
 * logika walidacji/zapisu zostaje w rodzicu.
 */
export function WizardStepper({
  stepIndex,
  stepCount,
  stepTitle,
  stepHint,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  children,
}: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.dots}>
        {Array.from({ length: stepCount }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === stepIndex && styles.dotActive,
              i < stepIndex && styles.dotDone,
            ]}
          />
        ))}
      </View>

      {stepTitle ? <Text style={styles.title}>{stepTitle}</Text> : null}
      {stepHint ? <Text style={styles.hint}>{stepHint}</Text> : null}

      <View style={styles.content}>{children}</View>

      <View style={styles.footer}>
        {stepIndex > 0 ? (
          <Button label={t('common.back')} variant="secondary" onPress={onBack} style={styles.footerBtn} />
        ) : (
          <View style={styles.footerBtn} />
        )}
        <Button
          label={nextLabel ?? t('common.next')}
          onPress={onNext}
          disabled={nextDisabled}
          style={styles.footerBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.three,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Brand.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: Brand.primary,
  },
  dotDone: {
    backgroundColor: Brand.primaryMuted,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: Brand.textPrimary,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: -8,
  },
  content: {
    gap: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  footerBtn: {
    flex: 1,
    borderRadius: Radius.md,
  },
});

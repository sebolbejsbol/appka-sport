import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import {
  useTournamentFormSections,
  validateTournamentForm,
  type TournamentFormValue,
} from '@/components/tournament-form';
import { WizardStepper } from '@/components/wizard-stepper';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { formatTeamSport } from '@/lib/sports';

type Props = {
  value: TournamentFormValue;
  onChange: (patch: Partial<TournamentFormValue>) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

const STEP_TITLES = [
  'sectionBasic',
  'stepSchedule',
  'stepLocation',
  'sectionConfig',
  'stepScoring',
  'sectionGroups',
  'stepReview',
] as const;

const STEP_HINTS = [
  'stepIdentityHint',
  'stepScheduleHint',
  'stepLocationHint',
  'stepTeamSetupHint',
  'stepScoringHint',
  'stepGroupsHint',
  'stepReviewHint',
] as const;

/**
 * Tworzenie turnieju krok po kroku zamiast jednego długiego formularza —
 * pola i ich walidacja/stan (logo, lista grup) są DOKŁADNIE te same co w
 * płaskim <TournamentForm> (patrz useTournamentFormSections), tylko
 * pokazywane po jednym kroku naraz. Autorytatywna walidacja biznesowa
 * (validateTournamentForm) uruchamia się raz, na ostatnim kroku — kroki
 * pośrednie robią tylko lekkie sprawdzenie UX, żeby nie dało się przejść
 * dalej z pustym polem, bez duplikowania logiki walidacji.
 */
export function TournamentFormWizard({ value, onChange, onSubmit, disabled }: Props) {
  const sections = useTournamentFormSections({ value, onChange, disabled });
  const [stepIndex, setStepIndex] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const stepContent = [
    sections.identity,
    sections.schedule,
    sections.location,
    sections.teamSetup,
    sections.scoring,
    sections.groups,
    <ReviewSummary key="review" value={value} />,
  ];

  const lastStep = stepContent.length - 1;

  function localStepCheck(index: number): string | null {
    if (index === 0 && value.name.trim().length < 3) return t('tournamentForm.errName');
    if (index === 5 && value.groupNames.map((g) => g.trim()).filter(Boolean).length < 1) {
      return t('tournamentForm.errGroups');
    }
    return null;
  }

  function goNext() {
    if (stepIndex === lastStep) {
      const error = validateTournamentForm(value);
      if (error) {
        setStepError(error);
        return;
      }
      setStepError(null);
      onSubmit();
      return;
    }
    const localError = localStepCheck(stepIndex);
    if (localError) {
      setStepError(localError);
      return;
    }
    setStepError(null);
    setStepIndex((i) => i + 1);
  }

  function goBack() {
    setStepError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  return (
    <WizardStepper
      stepIndex={stepIndex}
      stepCount={stepContent.length}
      stepTitle={t(`tournamentForm.${STEP_TITLES[stepIndex]}`)}
      stepHint={t(`tournamentForm.${STEP_HINTS[stepIndex]}`)}
      onBack={goBack}
      onNext={goNext}
      nextLabel={stepIndex === lastStep ? t('tournamentForm.createAction') : undefined}
      nextDisabled={disabled}>
      {stepContent[stepIndex]}
      {stepError ? <Text style={styles.error}>{stepError}</Text> : null}
    </WizardStepper>
  );
}

function ReviewSummary({ value }: { value: TournamentFormValue }) {
  const rows: [string, string][] = [
    [t('tournamentForm.name'), value.name || '—'],
    [t('tournamentForm.sport'), formatTeamSport(value.sport)],
    [t('tournamentForm.eventDate'), `${value.eventDate} ${value.startTime}`.trim() || '—'],
    [t('tournamentForm.locationName'), value.locationName || '—'],
    [t('tournamentForm.maxTeams'), value.maxTeams || '—'],
    [t('tournamentForm.playersPerTeam'), value.playersPerTeam || '—'],
    [
      t('tournamentForm.sectionGroups'),
      value.groupNames.map((g) => g.trim()).filter(Boolean).join(', ') || '—',
    ],
  ];
  return (
    <>
      {rows.map(([label, val]) => (
        <Text key={label} style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>{label}: </Text>
          {val}
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  error: {
    fontSize: 13,
    color: Brand.danger,
    textAlign: 'center',
  },
  reviewRow: {
    fontSize: 15,
    color: Brand.textPrimary,
  },
  reviewLabel: {
    fontWeight: '700',
    color: Brand.textSecondary,
  },
});

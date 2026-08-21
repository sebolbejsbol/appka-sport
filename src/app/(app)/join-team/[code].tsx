import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, BrandFonts } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { joinTeamViaCode, type JoinTeamViaCodeResult } from '@/lib/teams';

export default function JoinTeamScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = params.code;

  const [outcome, setOutcome] = useState<JoinTeamViaCodeResult | null>(null);

  useEffect(() => {
    if (!code) {
      setOutcome({ result: 'error', teamId: null, teamName: null, tournamentId: null });
      return;
    }
    void joinTeamViaCode(code).then(setOutcome);
  }, [code]);

  function goToTeam() {
    if (!outcome?.teamId) return;
    if (outcome.tournamentId) {
      router.replace({
        pathname: '/tournament/[id]/team/[teamId]',
        params: { id: outcome.tournamentId, teamId: outcome.teamId },
      } as unknown as Href);
    } else {
      router.replace({ pathname: '/teams/[id]', params: { id: outcome.teamId } } as unknown as Href);
    }
  }

  const message =
    outcome?.result === 'ok'
      ? t('joinTeam.success').replace('{team}', outcome.teamName ?? '')
      : outcome?.result === 'already_member'
        ? t('joinTeam.alreadyMember').replace('{team}', outcome.teamName ?? '')
        : t('joinTeam.notFound');

  return (
    <View style={styles.flex}>
      <ScreenHeader insetTop={insets.top} onBack={() => goBack('/' as Href)} />
      <View style={styles.content}>
        {outcome === null ? (
          <ActivityIndicator color={Brand.primary} />
        ) : (
          <>
            <Text style={styles.message}>{message}</Text>
            {outcome.teamId ? (
              <Button label={t('joinTeam.goToTeam')} onPress={goToTeam} style={styles.btn} />
            ) : (
              <Button label={t('joinTeam.goHome')} variant="secondary" onPress={() => router.replace('/' as Href)} style={styles.btn} />
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 20 },
  message: { fontFamily: BrandFonts.bodySemibold, fontSize: 16, color: Brand.textPrimary, textAlign: 'center', fontWeight: '600' },
  btn: { minWidth: 220 },
});

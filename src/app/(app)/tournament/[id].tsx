import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { formatTeamSport } from '@/lib/sports';
import { goBack } from '@/lib/navigation';
import { getTournamentDetail, type Tournament, type TournamentStatus } from '@/lib/tournaments';

function statusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'draft': return t('tournamentStatus.draft');
    case 'registration_open': return t('tournamentStatus.registrationOpen');
    case 'registration_closed': return t('tournamentStatus.registrationClosed');
    case 'ready': return t('tournamentStatus.ready');
    case 'in_progress': return t('tournamentStatus.inProgress');
    case 'completed': return t('tournamentStatus.completed');
    case 'cancelled': return t('tournamentStatus.cancelled');
  }
}

export default function TournamentDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const { data } = await getTournamentDetail(tournamentId);
    setTournament(data);
    setNotFound(!data);
    setLoading(false);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (notFound || !tournament) {
    return (
      <View style={styles.flex}>
        <ScreenHeader insetTop={insets.top} onBack={() => goBack('/' as Href)} />
        <Text style={styles.muted}>{t('tournamentDetail.notFound')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader insetTop={insets.top} title={tournament.name} onBack={() => goBack('/' as Href)} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.headerRow}>
          {tournament.logo_url ? <Image source={{ uri: tournament.logo_url }} style={styles.logo} /> : null}
          <View style={styles.headerText}>
            <Text style={styles.sportBadge}>{formatTeamSport(tournament.sport)}</Text>
            <Text style={styles.statusBadge}>{statusLabel(tournament.status)}</Text>
          </View>
        </View>

        {tournament.description ? <Text style={styles.description}>{tournament.description}</Text> : null}

        <View style={styles.infoBlock}>
          <Text style={styles.infoLine}>
            {tournament.event_date} · {tournament.start_time.slice(0, 5)}
            {tournament.end_time ? `–${tournament.end_time.slice(0, 5)}` : ''}
          </Text>
          {tournament.location_name ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.locationLabel')}: {tournament.location_name}</Text>
          ) : null}
          {tournament.address ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.addressLabel')}: {tournament.address}</Text>
          ) : null}
          {tournament.city ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.cityLabel')}: {tournament.city}</Text>
          ) : null}
          {tournament.contact_info ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.contactLabel')}: {tournament.contact_info}</Text>
          ) : null}
          {tournament.registration_opens_at ? (
            <Text style={styles.infoLine}>
              {t('tournamentDetail.registrationOpensLabel')}: {new Date(tournament.registration_opens_at).toLocaleString()}
            </Text>
          ) : null}
          <Text style={styles.infoLine}>
            {t('tournamentDetail.registrationClosesLabel')}: {new Date(tournament.registration_closes_at).toLocaleString()}
          </Text>
          <Text style={styles.infoLine}>
            0 / {tournament.max_teams} {t('tournamentDetail.teamsRegistered')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  logo: { width: 64, height: 64, borderRadius: Radius.md, backgroundColor: Brand.surface },
  headerText: { gap: 6 },
  sportBadge: { fontSize: 13, fontWeight: '600', color: Brand.textSecondary },
  statusBadge: { fontSize: 13, fontWeight: '700', color: Brand.primary },
  description: { fontSize: 14, color: Brand.textPrimary, marginBottom: 16, lineHeight: 20 },
  infoBlock: { gap: 8 },
  infoLine: { fontSize: 14, color: Brand.textSecondary },
});

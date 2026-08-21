import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Brand, BrandFonts } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { formatTeamSport } from '@/lib/sports';
import {
  TOURNAMENT_STATUSES,
  listTournaments,
  type TournamentListItem,
  type TournamentStatus,
} from '@/lib/tournaments';
import { goBack } from '@/lib/navigation';

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

export default function AdminTournamentsScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [filter, setFilter] = useState<TournamentStatus | null>(null);
  const [items, setItems] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await listTournaments(filter, true, 100, 0);
    setItems(data);
    setLoadError(Boolean(error));
    setLoading(false);
  }, [filter, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  if (roleLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <ScreenHeader insetTop={insets.top} title={t('adminTournaments.title')} onBack={() => goBack('/admin')} />
        <Text style={styles.muted}>{t('admin.notAuthorized')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('adminTournaments.title')}
        onBack={() => goBack('/admin')}
        rightActions={[
          {
            key: 'create',
            icon: '+',
            primary: true,
            accessibilityLabel: t('adminTournaments.createLabel'),
            onPress: () => router.push('/admin/tournaments/create'),
          },
        ]}
      />

      <View style={styles.filtersRow}>
        <Pressable
          onPress={() => setFilter(null)}
          style={[styles.filterChip, filter === null && styles.filterChipActive]}>
          <Text style={[styles.filterChipText, filter === null && styles.filterChipTextActive]}>
            {t('adminTournaments.filterAll')}
          </Text>
        </Pressable>
        {TOURNAMENT_STATUSES.map((status) => {
          const active = filter === status;
          return (
            <Pressable
              key={status}
              onPress={() => setFilter(status)}
              style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {statusLabel(status)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('adminTournaments.loadError')}</Text>
      ) : items.length === 0 ? (
        <Text style={styles.muted}>{t('adminTournaments.empty')}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/admin/tournaments/[id]/edit', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {formatTeamSport(item.sport)} · {item.event_date}
                </Text>
              </View>
              <Text style={styles.statusBadge}>{statusLabel(item.status)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontSize: 15, fontFamily: BrandFonts.body, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  filterChipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', fontFamily: BrandFonts.bodySemibold, color: Brand.textPrimary },
  filterChipTextActive: { color: Brand.primaryText },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  pressed: { opacity: 0.85 },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', fontFamily: BrandFonts.bodyBold, color: Brand.primary },
  rowMeta: { fontSize: 13, fontFamily: BrandFonts.body, color: Brand.textSecondary },
  statusBadge: { fontSize: 12, fontWeight: '600', fontFamily: BrandFonts.bodySemibold, color: Brand.textMuted },
});

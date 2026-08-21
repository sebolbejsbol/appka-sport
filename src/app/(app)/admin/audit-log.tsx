import type { Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Brand, BrandFonts } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { getAuditLog, type AuditLogEntityType, type AuditLogEntry } from '@/lib/audit-log';
import { goBack } from '@/lib/navigation';

const ENTITY_TYPES: AuditLogEntityType[] = [
  'user',
  'tournament',
  'tournament_team',
  'tournament_match',
  'tournament_playoff_match',
];

function entityTypeLabel(type: AuditLogEntityType | null): string {
  switch (type) {
    case 'user': return t('auditLog.entityUser');
    case 'tournament': return t('auditLog.entityTournament');
    case 'tournament_team': return t('auditLog.entityTournamentTeam');
    case 'tournament_match': return t('auditLog.entityTournamentMatch');
    case 'tournament_playoff_match': return t('auditLog.entityTournamentPlayoffMatch');
    default: return t('auditLog.entityAll');
  }
}

function formatEntryTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default function AuditLogScreen() {
  const insets = useSafeAreaInsets();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();

  const [filter, setFilter] = useState<AuditLogEntityType | null>(null);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    const result = await getAuditLog(filter, 100);
    setEntries(result.data);
    setLoadError(Boolean(result.error));
    setLoading(false);
  }, [isSuperAdmin, filter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (roleLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isSuperAdmin) {
    return (
      <View style={styles.container}>
        <ScreenHeader insetTop={insets.top} title={t('auditLog.title')} onBack={() => goBack('/admin' as Href)} />
        <Text style={styles.muted}>{t('adminUsers.notSuperAdmin')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader insetTop={insets.top} title={t('auditLog.title')} onBack={() => goBack('/admin' as Href)} />

      <View style={styles.filtersRow}>
        {[null, ...ENTITY_TYPES].map((key) => {
          const active = filter === key;
          return (
            <Pressable
              key={key ?? 'all'}
              onPress={() => setFilter(key)}
              style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {entityTypeLabel(key)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('auditLog.loadError')}</Text>
      ) : entries.length === 0 ? (
        <Text style={styles.muted}>{t('auditLog.empty')}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          {entries.map((entry) => (
            <View key={entry.id} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.action}>{entry.action}</Text>
                <Text style={styles.time}>{formatEntryTime(entry.created_at)}</Text>
              </View>
              <Text style={styles.meta}>
                {entry.actor_nick ?? t('common.nick')} · {entry.entity_type}
                {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ''}
              </Text>
              {Object.keys(entry.metadata).length > 0 ? (
                <Text style={styles.metadata}>{JSON.stringify(entry.metadata)}</Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
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
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Brand.border, gap: 4 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  action: { fontSize: 14, fontWeight: '700', fontFamily: BrandFonts.bodyBold, color: Brand.textPrimary },
  time: { fontSize: 12, fontFamily: BrandFonts.monoMedium, fontVariant: ['tabular-nums'], color: Brand.textMuted },
  meta: { fontSize: 12, fontFamily: BrandFonts.body, color: Brand.textSecondary },
  metadata: { fontSize: 11, fontFamily: BrandFonts.mono, color: Brand.textMuted, marginTop: 2 },
});

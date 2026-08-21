import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, BrandFonts } from '@/constants/theme';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import {
  getAdminUserReportsQueue,
  reportReasonLabel,
  updateUserReportStatus,
  type AdminUserReportItem,
  type UserReportStatus,
} from '@/lib/admin-reports';
import { formatEventDateTime } from '@/lib/datetime';
import { goBack } from '@/lib/navigation';
import { getProfileAdminFlag } from '@/lib/profiles';

const FILTERS: UserReportStatus[] = ['pending', 'reviewed', 'dismissed'];

export default function AdminReportsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<UserReportStatus>('pending');
  const [reports, setReports] = useState<AdminUserReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    let active = true;
    getProfileAdminFlag(userId).then(({ isAdmin: admin }) => {
      if (active) setIsAdmin(admin);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setLoadError(false);
    setActionError(null);
    const { data, error } = await getAdminUserReportsQueue(filter);
    setReports(data);
    setLoadError(Boolean(error));
    setLoading(false);
  }, [filter, isAdmin]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [filter, isAdmin, load]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  function filterLabel(key: UserReportStatus): string {
    if (key === 'pending') return t('adminReports.filterPending');
    if (key === 'reviewed') return t('adminReports.filterReviewed');
    return t('adminReports.filterDismissed');
  }

  function emptyLabel(): string {
    if (filter === 'pending') return t('adminReports.emptyPending');
    if (filter === 'reviewed') return t('adminReports.emptyReviewed');
    return t('adminReports.emptyDismissed');
  }

  function openProfile(userId: string) {
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  async function handleUpdate(reportId: string, status: 'reviewed' | 'dismissed') {
    setBusyId(reportId);
    setActionError(null);
    const result = await updateUserReportStatus(reportId, status);
    setBusyId(null);

    if (result === 'ok') {
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      return;
    }

    if (result === 'not_admin') {
      setActionError(t('adminReports.notAdmin'));
      setIsAdmin(false);
      return;
    }
    if (result === 'not_found' || result === 'already_closed') {
      void load();
      return;
    }
    setActionError(t('adminReports.actionError'));
  }

  if (isAdmin === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => goBack('/admin' as Href)} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('adminReports.title')}</Text>
        <Text style={styles.muted}>{t('adminReports.notAdmin')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Pressable onPress={() => goBack('/admin' as Href)} hitSlop={12} style={styles.backButton}>
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </Pressable>

      <Text style={styles.title}>{t('adminReports.title')}</Text>
      <Text style={styles.hint}>{t('adminReports.hint')}</Text>

      <View style={styles.filtersRow}>
        {FILTERS.map((key) => {
          const active = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {filterLabel(key)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('adminReports.loadError')}</Text>
      ) : reports.length === 0 ? (
        <Text style={styles.muted}>{emptyLabel()}</Text>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <ReportRow
              report={item}
              showActions={filter === 'pending'}
              busy={busyId === item.id}
              onOpenProfile={openProfile}
              onReview={() => void handleUpdate(item.id, 'reviewed')}
              onDismiss={() => void handleUpdate(item.id, 'dismissed')}
            />
          )}
        />
      )}
    </View>
  );
}

type RowProps = {
  report: AdminUserReportItem;
  showActions: boolean;
  busy: boolean;
  onOpenProfile: (userId: string) => void;
  onReview: () => void;
  onDismiss: () => void;
};

function ReportRow({
  report,
  showActions,
  busy,
  onOpenProfile,
  onReview,
  onDismiss,
}: RowProps) {
  const reportedNick = report.reported_nick?.trim() || t('common.nick');
  const reporterNick = report.reporter_nick?.trim() || t('common.nick');

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Pressable onPress={() => onOpenProfile(report.reported_user_id)}>
          <Text style={styles.rowTitle}>
            {t('adminReports.reportedUser')}: {reportedNick}
          </Text>
        </Pressable>
        <Text style={styles.rowMeta}>
          {t('adminReports.reporter')}: {reporterNick}
        </Text>
        <Text style={styles.rowMeta}>
          {t('adminReports.reason')}: {reportReasonLabel(report.reason)}
        </Text>
        {report.details ? (
          <Text style={styles.rowDetails}>
            {t('adminReports.details')}: {report.details}
          </Text>
        ) : null}
        <Text style={styles.rowDate}>{formatEventDateTime(report.created_at)}</Text>
      </View>

      {showActions ? (
        <View style={styles.rowActions}>
          <Pressable
            style={({ pressed }) => [styles.reviewBtn, pressed && styles.pressed]}
            onPress={onReview}
            disabled={busy}>
            <Text style={styles.reviewBtnText}>{t('adminReports.markReviewed')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.dismissBtn, pressed && styles.pressed]}
            onPress={onDismiss}
            disabled={busy}>
            <Text style={styles.dismissBtnText}>{t('adminReports.dismiss')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: Brand.screenBackground,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backText: {
    fontFamily: BrandFonts.body,
    fontSize: 16,
    color: Brand.textSecondary,
  },
  title: {
    fontFamily: BrandFonts.display,
    fontSize: 32,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginBottom: 8,
  },
  hint: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textMuted,
    marginBottom: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  filterChipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  filterChipText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  filterChipTextActive: {
    color: Brand.primaryText,
  },
  loader: {
    marginTop: 32,
  },
  muted: {
    fontFamily: BrandFonts.body,
    fontSize: 15,
    color: Brand.textMuted,
    marginTop: 24,
  },
  errorText: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.danger,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowActions: {
    gap: 8,
    paddingTop: 2,
    maxWidth: 120,
  },
  rowTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    color: Brand.primary,
  },
  rowMeta: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textSecondary,
  },
  rowDetails: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textPrimary,
    fontStyle: 'italic',
  },
  rowDate: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 2,
  },
  reviewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.primary,
  },
  reviewBtnText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 11,
    fontWeight: '600',
    color: Brand.primaryText,
    textAlign: 'center',
  },
  dismissBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.danger,
    backgroundColor: Brand.surface,
  },
  dismissBtnText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 11,
    fontWeight: '600',
    color: Brand.danger,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});

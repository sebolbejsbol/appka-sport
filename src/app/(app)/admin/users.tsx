import { useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '@/components/text-field';
import { Brand } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { getAdminUserList, setUserRole, type AdminUserRow } from '@/lib/admin-users';
import { goBack } from '@/lib/navigation';
import type { AppRole } from '@/lib/profiles';

const FILTERS: Exclude<AppRole, 'user'>[] = ['admin', 'super_admin'];
const PAGE_SIZE = 50;

export default function AdminUsersScreen() {
  const insets = useSafeAreaInsets();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();

  const [filter, setFilter] = useState<AppRole | null>('admin');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setLoadError(false);
    setActionError(null);
    const { data, totalCount: count, error } = await getAdminUserList(
      debouncedSearch,
      filter,
      PAGE_SIZE,
      0,
    );
    setUsers(data);
    setTotalCount(count);
    setLoadError(Boolean(error));
    setLoading(false);
  }, [debouncedSearch, filter, isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) void load();
  }, [isSuperAdmin, load]);

  useFocusEffect(
    useCallback(() => {
      if (isSuperAdmin) void load();
    }, [isSuperAdmin, load]),
  );

  function filterLabel(key: AppRole): string {
    if (key === 'admin') return t('adminUsers.filterAdmins');
    if (key === 'super_admin') return t('adminUsers.filterSuperAdmins');
    return t('adminUsers.filterEveryone');
  }

  function emptyLabel(): string {
    if (filter === 'admin') return t('adminUsers.emptyAdmins');
    if (filter === 'super_admin') return t('adminUsers.emptySuperAdmins');
    return t('adminUsers.emptyEveryone');
  }

  function confirmGrant(user: AdminUserRow) {
    Alert.alert(t('adminUsers.grantConfirmTitle'), t('adminUsers.grantConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('adminUsers.grantAdmin'), onPress: () => void handleSetRole(user.id, 'admin') },
    ]);
  }

  function confirmRemove(user: AdminUserRow) {
    Alert.alert(t('adminUsers.removeConfirmTitle'), t('adminUsers.removeConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('adminUsers.removeAdmin'),
        style: 'destructive',
        onPress: () => void handleSetRole(user.id, 'user'),
      },
    ]);
  }

  async function handleSetRole(userId: string, role: 'user' | 'admin') {
    setBusyId(userId);
    setActionError(null);
    const result = await setUserRole(userId, role);
    setBusyId(null);

    if (result === 'ok' || result === 'no_change' || result === 'not_found') {
      void load();
      return;
    }
    if (result === 'not_super_admin') {
      setDenied(true);
      return;
    }
    setActionError(t('adminUsers.actionError'));
  }

  if (roleLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isSuperAdmin || denied) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => goBack('/admin' as Href)} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('adminUsers.title')}</Text>
        <Text style={styles.muted}>{t('adminUsers.notSuperAdmin')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Pressable onPress={() => goBack('/admin' as Href)} hitSlop={12} style={styles.backButton}>
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </Pressable>

      <Text style={styles.title}>{t('adminUsers.title')}</Text>
      <Text style={styles.hint}>{t('adminUsers.hint')}</Text>

      <TextField
        label={t('adminUsers.searchLabel')}
        placeholder={t('adminUsers.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.filtersRow}>
        {[...FILTERS, null].map((key) => {
          const active = filter === key;
          return (
            <Pressable
              key={key ?? 'everyone'}
              onPress={() => setFilter(key)}
              style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {filterLabel(key ?? 'user')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('adminUsers.loadError')}</Text>
      ) : users.length === 0 ? (
        <Text style={styles.muted}>{emptyLabel()}</Text>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <Text style={styles.countLabel}>
              {users.length} / {totalCount}
            </Text>
          }
          renderItem={({ item }) => (
            <UserRow
              user={item}
              busy={busyId === item.id}
              onGrant={() => confirmGrant(item)}
              onRemove={() => confirmRemove(item)}
            />
          )}
        />
      )}
    </View>
  );
}

type RowProps = {
  user: AdminUserRow;
  busy: boolean;
  onGrant: () => void;
  onRemove: () => void;
};

function UserRow({ user, busy, onGrant, onRemove }: RowProps) {
  const nick = user.nick?.trim() || t('common.nick');
  const roleLabel =
    user.role === 'super_admin'
      ? t('adminUsers.roleSuperAdmin')
      : user.role === 'admin'
        ? t('adminUsers.roleAdmin')
        : t('adminUsers.roleUser');

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{nick}</Text>
        {user.email ? <Text style={styles.rowMeta}>{user.email}</Text> : null}
        <Text style={styles.roleBadge}>{roleLabel}</Text>
      </View>

      {user.role === 'super_admin' ? null : (
        <View style={styles.rowActions}>
          {user.role === 'admin' ? (
            <Pressable
              style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
              onPress={onRemove}
              disabled={busy}>
              <Text style={styles.removeBtnText}>{t('adminUsers.removeAdmin')}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.grantBtn, pressed && styles.pressed]}
              onPress={onGrant}
              disabled={busy}>
              <Text style={styles.grantBtnText}>{t('adminUsers.grantAdmin')}</Text>
            </Pressable>
          )}
        </View>
      )}
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
    fontSize: 16,
    color: Brand.textSecondary,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: Brand.textMuted,
    marginBottom: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
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
    fontSize: 15,
    color: Brand.textMuted,
    marginTop: 24,
  },
  errorText: {
    fontSize: 14,
    color: Brand.danger,
    marginBottom: 8,
  },
  countLabel: {
    fontSize: 13,
    color: Brand.textMuted,
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
    maxWidth: 140,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.primary,
  },
  rowMeta: {
    fontSize: 13,
    color: Brand.textSecondary,
  },
  roleBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textMuted,
    marginTop: 2,
  },
  grantBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.primary,
  },
  grantBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Brand.primaryText,
    textAlign: 'center',
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.danger,
    backgroundColor: Brand.surface,
  },
  removeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Brand.danger,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});

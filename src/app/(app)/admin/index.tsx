import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Brand } from '@/constants/theme';
import { useIsAdmin } from '@/hooks/use-is-admin';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';

type AdminTool = {
  key: string;
  title: string;
  hint: string;
  path: '/admin/fields' | '/admin/reports';
};

const ADMIN_TOOLS: AdminTool[] = [
  {
    key: 'fields',
    title: t('admin.fieldsTitle'),
    hint: t('admin.fieldsHint'),
    path: '/admin/fields',
  },
  {
    key: 'reports',
    title: t('admin.reportsTitle'),
    hint: t('admin.reportsHint'),
    path: '/admin/reports',
  },
];

export default function AdminHubScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <ScreenHeader insetTop={insets.top} title={t('admin.title')} onBack={() => goBack('/')} />
        <Text style={styles.denied}>{t('admin.notAuthorized')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader insetTop={insets.top} title={t('admin.title')} />

      <Text style={styles.subtitle}>{t('admin.subtitle')}</Text>

      <View style={styles.list}>
        {ADMIN_TOOLS.map((tool) => (
          <Pressable
            key={tool.key}
            onPress={() => router.push(tool.path)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View style={styles.itemMain}>
              <Text style={styles.itemTitle}>{tool.title}</Text>
              <Text style={styles.itemHint}>{tool.hint}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 48,
  },
  subtitle: {
    fontSize: 14,
    color: Brand.textMuted,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  denied: {
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    paddingHorizontal: 24,
    lineHeight: 22,
  },
  list: {
    gap: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  pressed: {
    opacity: 0.85,
  },
  itemMain: {
    flex: 1,
    paddingRight: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  itemHint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 4,
  },
  chevron: {
    fontSize: 22,
    color: Brand.textMuted,
    fontWeight: '300',
  },
});

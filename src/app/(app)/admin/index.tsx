import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocumentIcon, FlagIcon, PeopleIcon, PinIcon, TrophyIcon } from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import {
  SettingsChevron,
  SettingsDivider,
  SettingsGroup,
  SettingsIconRow,
} from '@/components/settings-group';
import { Brand, BrandFonts } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import type { ReactNode } from 'react';

type AdminTool = {
  key: string;
  title: string;
  hint: string;
  icon: ReactNode;
  iconBg: string;
  path: '/admin/fields' | '/admin/reports' | '/admin/users' | '/admin/tournaments' | '/admin/audit-log';
};

// Funkcja, nie stała modułowa — inaczej etykiety zamrażałyby się w języku
// z chwili importu modułu i nie zmieniałyby się po przełączeniu języka.
function buildAdminTools(isSuperAdmin: boolean): AdminTool[] {
  const tools: AdminTool[] = [
    {
      key: 'fields',
      title: t('admin.fieldsTitle'),
      hint: t('admin.fieldsHint'),
      icon: <PinIcon size={16} color={Brand.primary} />,
      iconBg: Brand.primaryLight,
      path: '/admin/fields',
    },
    {
      key: 'reports',
      title: t('admin.reportsTitle'),
      hint: t('admin.reportsHint'),
      icon: <FlagIcon size={16} color={Brand.danger} />,
      iconBg: Brand.dangerLight,
      path: '/admin/reports',
    },
    {
      key: 'tournaments',
      title: t('admin.tournamentsTitle'),
      hint: t('admin.tournamentsHint'),
      icon: <TrophyIcon size={16} color={Brand.amber} />,
      iconBg: Brand.amberLight,
      path: '/admin/tournaments',
    },
  ];

  if (isSuperAdmin) {
    tools.push({
      key: 'users',
      title: t('admin.usersTitle'),
      hint: t('admin.usersHint'),
      icon: <PeopleIcon size={16} color={Brand.teal} />,
      iconBg: Brand.tealLight,
      path: '/admin/users',
    });
    tools.push({
      key: 'audit-log',
      title: t('admin.auditLogTitle'),
      hint: t('admin.auditLogHint'),
      icon: <DocumentIcon size={16} color={Brand.textSecondary} />,
      iconBg: Brand.surfaceMuted,
      path: '/admin/audit-log',
    });
  }

  return tools;
}

export default function AdminHubScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin, isSuperAdmin, loading } = useUserRole();
  const ADMIN_TOOLS = buildAdminTools(isSuperAdmin);

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

      <SettingsGroup>
        {ADMIN_TOOLS.map((tool, index) => (
          <View key={tool.key}>
            {index > 0 ? <SettingsDivider /> : null}
            <SettingsIconRow
              icon={tool.icon}
              iconBg={tool.iconBg}
              label={tool.title}
              hint={tool.hint}
              onPress={() => router.push(tool.path)}
              trailing={<SettingsChevron />}
            />
          </View>
        ))}
      </SettingsGroup>
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
    fontFamily: BrandFonts.body,
    color: Brand.textMuted,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  denied: {
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    fontFamily: BrandFonts.body,
    paddingHorizontal: 24,
    lineHeight: 22,
  },
});

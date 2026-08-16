import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import type { TravelProfile } from '@/lib/field-navigation';

const ICON_PATHS: Record<TravelProfile, string> = {
  walking:
    'M419-378 345-63q-2 11-10.33 17t-19.19 6Q301-40 291.5-51T285-76l109-550-101 43v103q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.82-8.91-9-8.92-9-22.09v-122q0-9.33 4.88-16.72 4.87-7.39 13.12-11.28l174.29-73.22Q438-710 453.5-711.5T484-710q17 3 29.5 10.87Q526-691.25 534-679l42 66q16 24 35.5 43t42.5 33q17 10 34.5 16t36.5 9q12.11 2.25 20.05 10.87 7.95 8.63 7.95 21.38 0 12.75-8.78 21.25T723-452q-59-7-105.5-35.5T533-568l-38 152 82 74q5 4.55 7.5 10.24T587-320v250q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63Q527-57.25 527-70v-210l-108-98Zm69.5-397.42q-21.5-21.42-21.5-51.5t21.42-51.58q21.42-21.5 51.5-21.5t51.58 21.42q21.5 21.42 21.5 51.5t-21.42 51.58q-21.42 21.5-51.5 21.5t-51.58-21.42Z',
  cycling:
    'M195-80q-81 0-138-57T0-275q0-81 57-138t138-57q81 0 138 57t57 138q0 81-57 138T195-80Zm96-99q39-39 39-96t-39-96q-39-39-96-39t-96 39q-39 39-39 96t39 96q39 39 96 39t96-39Zm242-481L422-548l72 78q8 8 12 19t4 22v193q0 13-8.5 21.5T480-206q-13 0-21.5-8.5T450-236v-170L315-525q-11-9-16-22t-5-27q0-14 5.5-26t15.5-22l119-119q11-11 24.5-16t28.5-5q15 0 28.5 5t24.5 16l78 78q26 26 58.5 43t68.5 22q12 2 19.5 12t5.5 22q-2 12-12 19.5t-22 5.5q-46-6-88-27t-75-54l-40-40Zm34.5-115.5Q546-797 546-827t21.5-51.5Q589-900 619-900t51.5 21.5Q692-857 692-827t-21.5 51.5Q649-754 619-754t-51.5-21.5ZM765-80q-81 0-138-57t-57-138q0-81 57-138t138-57q81 0 138 57t57 138q0 81-57 138T765-80Zm96-99q39-39 39-96t-39-96q-39-39-96-39t-96 39q-39 39-39 96t39 96q39 39 96 39t96-39Z',
  driving:
    'M200-204v44q0 16.67-11.74 28.33Q176.53-120 159.76-120q-16.76 0-28.26-11.67Q120-143.33 120-160v-304q0-4.67.5-9.33.5-4.67 2.5-9.67l78-236q6-19 21.75-30T258-760h444q19.5 0 35.25 11T759-719l78 236q2 5 2.5 9.67.5 4.66.5 9.33v304q0 16.67-11.74 28.33Q816.53-120 799.76-120 783-120 771-131.96T759-161v-43H200Zm3-330h554l-55-166H258l-55 166Zm82.76 220q23.24 0 38.74-15.75Q340-345.5 340-368q0-23.33-15.75-39.67Q308.5-424 286-424q-23.33 0-39.67 16.26Q230-391.47 230-368.24q0 23.24 16.26 38.74 16.27 15.5 39.5 15.5ZM675-314q23.33 0 39.67-15.75Q731-345.5 731-368q0-23.33-16.26-39.67Q698.47-424 675.24-424q-23.24 0-38.74 16.26-15.5 16.27-15.5 39.5 0 23.24 15.75 38.74Q652.5-314 675-314Z',
};

const MODES: { profile: TravelProfile; labelKey: 'modeWalking' | 'modeCycling' | 'modeDriving' }[] = [
  { profile: 'walking', labelKey: 'modeWalking' },
  { profile: 'cycling', labelKey: 'modeCycling' },
  { profile: 'driving', labelKey: 'modeDriving' },
];

type Props = {
  value: TravelProfile;
  onChange: (profile: TravelProfile) => void;
  style?: StyleProp<ViewStyle>;
};

/** Wybór środka transportu na ekranie nawigacji do boiska (patrz field-navigate-screen.tsx/.web.tsx). */
export function TravelModePicker({ value, onChange, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      {MODES.map(({ profile, labelKey }) => {
        const active = profile === value;
        return (
          <Pressable
            key={profile}
            onPress={() => onChange(profile)}
            style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}>
            <Svg width={18} height={18} viewBox="0 -960 960 960">
              <Path fill={active ? Brand.primaryText : Brand.textSecondary} d={ICON_PATHS[profile]} />
            </Svg>
            <Text style={[styles.label, active && styles.labelActive]}>{t(`fieldNavigation.${labelKey}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: Radius.lg,
    backgroundColor: Brand.screenBackground,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  chipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  labelActive: {
    color: Brand.primaryText,
  },
});

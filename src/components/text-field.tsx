import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';

type Props = TextInputProps & {
  label: string;
  error?: string;
  /** Gdy true, pokazuje ikonę oka do przełączania widoczności hasła. */
  passwordToggle?: boolean;
};

export function TextField({ label, error, style, passwordToggle, secureTextEntry, ...rest }: Props) {
  const hasError = !!error;
  const [visible, setVisible] = useState(false);

  // Gdy włączony podgląd hasła: to pole zaczyna jako ukryte, a przycisk oka odsłania tekst.
  const isSecure = passwordToggle ? !visible : secureTextEntry;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            passwordToggle && styles.inputWithToggle,
            hasError && styles.inputError,
            style,
          ]}
          placeholderTextColor={Brand.textMuted}
          secureTextEntry={isSecure}
          {...rest}
        />
        {passwordToggle ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={visible ? t('common.hidePassword') : t('common.showPassword')}
            style={styles.eyeButton}>
            <Text style={styles.eyeIcon}>{visible ? '🙈' : '👁️'}</Text>
          </Pressable>
        ) : null}
      </View>
      {hasError ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
    color: Brand.textSecondary,
    textTransform: 'uppercase',
  },
  inputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Brand.textPrimary,
  },
  inputWithToggle: {
    paddingRight: 52,
  },
  inputError: {
    borderColor: Brand.danger,
    backgroundColor: Brand.dangerLight,
  },
  eyeButton: {
    position: 'absolute',
    right: 8,
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 20,
  },
  errorText: {
    fontSize: 13,
    color: Brand.danger,
    fontWeight: '500',
  },
});

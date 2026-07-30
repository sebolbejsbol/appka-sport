import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';

type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

export function FilterDropdown<T extends string>({ label, value, options, onChange }: Props<T>) {
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <ModalOptions
        triggerLabel={selected?.label ?? value}
        options={options}
        value={value}
        onChange={onChange}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

type ModalProps<T extends string> = {
  triggerLabel: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  bottomInset: number;
};

function ModalOptions<T extends string>({
  triggerLabel,
  value,
  options,
  onChange,
  bottomInset,
}: ModalProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
        <Text style={styles.triggerText}>{triggerLabel}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}
            onStartShouldSetResponder={() => true}>
            <ScrollView>
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={[styles.option, active && styles.optionActive]}>
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  triggerText: {
    fontSize: 15,
    color: Brand.textPrimary,
    flex: 1,
  },
  chevron: {
    fontSize: 14,
    color: Brand.textMuted,
    marginLeft: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Brand.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '50%',
    paddingTop: 8,
  },
  option: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  optionActive: {
    backgroundColor: Brand.primaryLight,
  },
  optionText: {
    fontSize: 16,
    color: Brand.textPrimary,
  },
  optionTextActive: {
    color: Brand.primary,
    fontWeight: '700',
  },
});

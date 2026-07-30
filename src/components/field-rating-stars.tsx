import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';

type Props = {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md';
};

const STAR_COUNT = 5;

export function FieldRatingStars({ value, onChange, size = 'md' }: Props) {
  const readonly = onChange == null;
  const starSize = size === 'sm' ? 16 : 22;

  return (
    <View style={styles.row}>
      {Array.from({ length: STAR_COUNT }, (_, index) => {
        const starValue = index + 1;
        const filled = starValue <= value;

        if (readonly) {
          return (
            <Text key={starValue} style={[styles.star, { fontSize: starSize }, filled && styles.filled]}>
              ★
            </Text>
          );
        }

        return (
          <Pressable
            key={starValue}
            onPress={() => onChange(starValue)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`${starValue}`}>
            <Text style={[styles.star, { fontSize: starSize }, filled && styles.filled]}>★</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
  },
  star: {
    color: Brand.border,
  },
  filled: {
    color: '#f5a623',
  },
});

import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';

type Props = {
  nick: string | null;
  avatarUrl?: string | null;
  size?: number;
  showOnline?: boolean;
  isOnline?: boolean;
};

function initialsFromNick(nick: string | null): string {
  const trimmed = (nick ?? '?').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function UserAvatar({
  nick,
  avatarUrl,
  size = 56,
  showOnline = false,
  isOnline = false,
}: Props) {
  const fontSize = Math.max(14, Math.round(size * 0.36));
  const dotSize = Math.max(10, Math.round(size * 0.22));

  return (
    <View style={{ width: size, height: size }}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Brand.border }}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
          recyclingKey={avatarUrl}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: size / 2 },
          ]}>
          <Text style={[styles.initials, { fontSize }]}>{initialsFromNick(nick)}</Text>
        </View>
      )}
      {showOnline ? (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: isOnline ? '#22c55e' : Brand.textMuted,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
  },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: Brand.surface,
  },
});

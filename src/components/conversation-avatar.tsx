import { Image, StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/components/user-avatar';
import { Brand } from '@/constants/theme';
import type { ConversationKind } from '@/lib/messages';

type Props = {
  kind: ConversationKind;
  title: string | null;
  photoUrl: string | null;
  isOnline?: boolean;
  size?: number;
};

/** Awatar rozmowy: zdjęcie/inicjały osoby (DM) lub zdjęcie/ikona grupy. */
export function ConversationAvatar({ kind, title, photoUrl, isOnline, size = 56 }: Props) {
  if (kind === 'dm') {
    return (
      <UserAvatar
        nick={title}
        avatarUrl={photoUrl}
        size={size}
        showOnline
        isOnline={Boolean(isOnline)}
      />
    );
  }

  const radius = size / 2;
  if (photoUrl?.trim()) {
    return (
      <Image
        source={{ uri: photoUrl.trim() }}
        style={[styles.image, { width: size, height: size, borderRadius: radius }]}
      />
    );
  }

  return (
    <View style={[styles.groupFallback, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.groupIcon, { fontSize: Math.round(size * 0.42) }]}>👥</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: Brand.border,
  },
  groupFallback: {
    backgroundColor: Brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupIcon: {
    color: Brand.primary,
  },
});

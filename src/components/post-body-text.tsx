import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Brand } from '@/constants/theme';
import type { PostMention } from '@/lib/posts';

const MENTION_PATTERN = /@([A-Za-z0-9_]{2,24})/g;

type Props = {
  body: string;
  mentions?: PostMention[];
  onMentionPress?: (userId: string) => void;
  style?: object;
};

export function PostBodyText({ body, mentions = [], onMentionPress, style }: Props) {
  if (!body.trim()) return null;

  const nickToId = new Map(
    mentions
      .filter((m) => m.nick)
      .map((m) => [m.nick!.toLowerCase(), m.user_id]),
  );

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of body.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;
    const nick = match[1];
    const userId = nickToId.get(nick.toLowerCase());

    if (index > lastIndex) {
      parts.push(body.slice(lastIndex, index));
    }

    if (userId && onMentionPress) {
      parts.push(
        <Text
          key={`m-${key++}`}
          style={styles.mention}
          onPress={() => onMentionPress(userId)}>
          @{nick}
        </Text>,
      );
    } else {
      parts.push(`@${nick}`);
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return (
    <Text style={[styles.body, style]}>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <Text key={`t-${i}`}>{part}</Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Brand.textPrimary,
  },
  mention: {
    color: Brand.primary,
    fontWeight: '700',
  },
});

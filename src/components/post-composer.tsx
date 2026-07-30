import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { pickPostMedia, type PickedMedia } from '@/lib/pick-image';

const MAX_POST_LENGTH = 2000;
const MAX_MEDIA = 4;

type Props = {
  posting?: boolean;
  postError?: boolean;
  onSubmit: (body: string, media: PickedMedia[]) => void | Promise<void>;
};

export function PostComposer({ posting = false, postError = false, onSubmit }: Props) {
  const [draft, setDraft] = useState('');
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const canPost = !posting && (draft.trim().length > 0 || media.length > 0);

  async function handlePost() {
    if (!canPost) return;
    await onSubmit(draft, media);
    setDraft('');
    setMedia([]);
  }

  async function handleAddMedia() {
    if (posting) return;
    const remaining = MAX_MEDIA - media.length;
    if (remaining <= 0) return;
    const picked = await pickPostMedia(remaining);
    if (picked.length === 0) return;
    setMedia((prev) => {
      const merged = [...prev, ...picked].slice(0, MAX_MEDIA);
      const videos = merged.filter((m) => m.mediaType === 'video');
      if (videos.length > 1) {
        const firstVideo = videos[0];
        return merged.filter((m) => m.mediaType !== 'video' || m === firstVideo);
      }
      return merged;
    });
  }

  function removeMedia(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        placeholder={t('feed.composerPlaceholder')}
        placeholderTextColor={Brand.textMuted}
        value={draft}
        onChangeText={setDraft}
        multiline
        maxLength={MAX_POST_LENGTH}
        editable={!posting}
      />

      {media.length > 0 ? (
        <View style={styles.previewRow}>
          {media.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={styles.previewItem}>
              {item.mediaType === 'video' ? (
                <View style={[styles.previewImage, styles.previewVideo]}>
                  <Text style={styles.previewVideoIcon}>▶</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: item.uri }}
                  style={styles.previewImage}
                  contentFit="cover"
                />
              )}
              <Pressable
                onPress={() => removeMedia(index)}
                hitSlop={8}
                style={styles.previewRemove}>
                <Text style={styles.previewRemoveText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.mentionHint}>{t('feed.mentionHint')}</Text>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Pressable
            onPress={() => void handleAddMedia()}
            disabled={posting || media.length >= MAX_MEDIA}
            style={({ pressed }) => [
              styles.mediaBtn,
              (posting || media.length >= MAX_MEDIA) && styles.mediaBtnDisabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.mediaBtnIcon}>📷</Text>
            <Text style={styles.mediaBtnText}>{t('feed.attachMedia')}</Text>
          </Pressable>
          <Text style={styles.charCount}>
            {draft.length}/{MAX_POST_LENGTH}
          </Text>
        </View>
        <Pressable
          onPress={() => void handlePost()}
          disabled={!canPost}
          style={({ pressed }) => [
            styles.postBtn,
            !canPost && styles.postBtnDisabled,
            pressed && canPost && styles.pressed,
          ]}>
          <Text style={[styles.postBtnText, !canPost && styles.postBtnTextDisabled]}>
            {posting ? '…' : t('feed.publish')}
          </Text>
        </Pressable>
      </View>

      {postError ? <Text style={styles.postError}>{t('feed.postError')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  input: {
    minHeight: 72,
    maxHeight: 140,
    fontSize: 15,
    lineHeight: 22,
    color: Brand.textPrimary,
    textAlignVertical: 'top',
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  previewItem: {
    width: 72,
    height: 72,
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: Radius.sm,
    backgroundColor: Brand.surfaceMuted,
  },
  previewVideo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  previewVideoIcon: {
    color: '#fff',
    fontSize: 22,
  },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Brand.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRemoveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 17,
  },
  mentionHint: {
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
  },
  mediaBtnDisabled: {
    opacity: 0.45,
  },
  mediaBtnIcon: {
    fontSize: 14,
  },
  mediaBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  charCount: {
    fontSize: 12,
    color: Brand.textMuted,
  },
  postBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    ...shadow('sm'),
  },
  postBtnDisabled: {
    opacity: 0.45,
  },
  postBtnText: {
    color: Brand.primaryText,
    fontSize: 14,
    fontWeight: '700',
  },
  postBtnTextDisabled: {
    color: Brand.primaryText,
  },
  postError: {
    color: Brand.danger,
    fontSize: 13,
    marginTop: 6,
  },
  pressed: {
    opacity: 0.85,
  },
});

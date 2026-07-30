import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, StyleSheet, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import type { PostMediaItem } from '@/lib/posts';

type Props = {
  media: PostMediaItem[];
  onPress?: () => void;
};

function PostVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.muted = false;
  });

  return (
    <View style={styles.videoWrap}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="cover"
      />
    </View>
  );
}

export function PostMedia({ media, onPress }: Props) {
  if (!media || media.length === 0) return null;

  const sorted = [...media].sort((a, b) => a.sort_order - b.sort_order);
  const videos = sorted.filter((m) => m.media_type === 'video' && m.url);
  const images = sorted.filter((m) => m.media_type === 'image' && m.url);

  return (
    <View style={styles.wrap}>
      {videos.map((v) => (
        <PostVideo key={v.storage_path} url={v.url as string} />
      ))}

      {images.length === 1 ? (
        <Pressable onPress={onPress} disabled={!onPress}>
          <Image
            source={{ uri: images[0].url }}
            style={styles.single}
            contentFit="cover"
            transition={150}
          />
        </Pressable>
      ) : images.length > 1 ? (
        <View style={styles.grid}>
          {images.map((img) => (
            <Pressable
              key={img.storage_path}
              onPress={onPress}
              disabled={!onPress}
              style={styles.gridItem}>
              <Image
                source={{ uri: img.url }}
                style={styles.gridImage}
                contentFit="cover"
                transition={150}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    gap: 8,
  },
  single: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: Radius.md,
    backgroundColor: Brand.surfaceMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridItem: {
    width: '49%',
    aspectRatio: 1,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.md,
    backgroundColor: Brand.surfaceMuted,
  },
  videoWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});

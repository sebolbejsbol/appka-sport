import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';

export default function MediaViewerScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string; type?: string }>();
  const url = params.url ?? '';
  const isVideo = params.type === 'video' || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);

  const player = useVideoPlayer(isVideo ? url : null, (p) => {
    if (isVideo) p.play();
  });

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => goBack('/messages')}
        style={[styles.closeBtn, { top: insets.top + 8 }]}
        hitSlop={12}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>

      {!url ? (
        <Text style={styles.error}>{t('messages.loadError')}</Text>
      ) : isVideo ? (
        <VideoView player={player} style={styles.media} nativeControls />
      ) : (
        <Image source={{ uri: url }} style={styles.media} contentFit="contain" />
      )}

      <Pressable
        onPress={() => void WebBrowser.openBrowserAsync(url)}
        style={[styles.downloadBtn, { bottom: insets.bottom + 16 }]}>
        <Text style={styles.downloadText}>{t('chat.download')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '80%' },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  error: { color: '#fff' },
  downloadBtn: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: Brand.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  downloadText: { color: Brand.primaryText, fontWeight: '700' },
});

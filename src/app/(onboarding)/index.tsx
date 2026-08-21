import { useCallback, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import CreateEventScreen from '@/components/create-event-screen';
import { Brand, Radius } from '@/constants/theme';
import { Typography } from '@/constants/ui';
import { useSession } from '@/context/session';
import { t, type TKey } from '@/i18n';
import { supabase } from '@/lib/supabase';

type Slide = { emoji: string; titleKey: TKey; bodyKey: TKey };

const SLIDES: Slide[] = [
  { emoji: '🗺️', titleKey: 'onboarding.slide1Title', bodyKey: 'onboarding.slide1Body' },
  { emoji: '🙌', titleKey: 'onboarding.slide2Title', bodyKey: 'onboarding.slide2Body' },
  { emoji: '💬', titleKey: 'onboarding.slide3Title', bodyKey: 'onboarding.slide3Body' },
  { emoji: '📍', titleKey: 'onboarding.slide4Title', bodyKey: 'onboarding.slide4Body' },
  { emoji: '🏆', titleKey: 'onboarding.slide5Title', bodyKey: 'onboarding.slide5Body' },
];

/**
 * Onboarding pokazywany raz, zaraz po dokończeniu profilu (gating:
 * src/context/session.tsx needsOnboarding + src/app/_layout.tsx). Trzy fazy:
 * intro (carousel slajdów) -> trial (prawdziwy formularz tworzenia eventu w
 * demoMode, patrz CreateEventScreenProps) -> done (ekran "to był tylko pokaz").
 * "Pomiń" w każdej fazie kończy onboarding od razu, bez przechodzenia dalej.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { session, markOnboardingComplete } = useSession();
  const userId = session?.user?.id;
  const { width } = useWindowDimensions();

  const [phase, setPhase] = useState<'intro' | 'trial' | 'done'>('intro');
  const [activeIndex, setActiveIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const finishOnboarding = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    if (userId) {
      await supabase.from('profiles').update({ has_completed_onboarding: true }).eq('id', userId);
    }
    markOnboardingComplete();
  }, [finishing, markOnboardingComplete, userId]);

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  }

  function goToSlide(index: number) {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setActiveIndex(index);
  }

  const isLastSlide = activeIndex === SLIDES.length - 1;

  if (phase === 'trial') {
    return (
      <View style={styles.flex1}>
        <CreateEventScreen
          demoMode
          onDemoSubmit={() => setPhase('done')}
          onDemoExit={() => setPhase('intro')}
        />
        <Pressable
          onPress={() => void finishOnboarding()}
          disabled={finishing}
          hitSlop={10}
          style={[styles.trialSkip, { top: insets.top + 10 }]}>
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={[styles.flex1, styles.doneContainer, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.doneEmoji}>🎉</Text>
        <Text style={styles.doneTitle}>{t('onboarding.doneTitle')}</Text>
        <Text style={styles.doneBody}>{t('onboarding.doneBody')}</Text>
        <Button
          label={finishing ? t('common.loading') : t('onboarding.doneCta')}
          onPress={() => void finishOnboarding()}
          disabled={finishing}
          style={styles.doneButton}
        />
      </View>
    );
  }

  return (
    <View style={styles.flex1}>
      <Pressable
        onPress={() => void finishOnboarding()}
        disabled={finishing}
        hitSlop={10}
        style={[styles.skip, { top: insets.top + 10 }]}>
        <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.flex1}>
        {SLIDES.map((slide) => (
          <View key={slide.titleKey} style={[styles.slide, { width, paddingTop: insets.top + 80 }]}>
            <Text style={styles.slideEmoji}>{slide.emoji}</Text>
            <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
            <Text style={styles.slideBody}>{t(slide.bodyKey)}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <Pressable key={slide.titleKey} onPress={() => goToSlide(i)} hitSlop={8}>
              <View style={[styles.dot, i === activeIndex && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
        <Button
          label={isLastSlide ? t('onboarding.tryIt') : t('onboarding.next')}
          onPress={() => (isLastSlide ? setPhase('trial') : goToSlide(activeIndex + 1))}
          style={styles.nextButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  skip: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  trialSkip: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  slideEmoji: {
    fontSize: 72,
    marginBottom: 28,
  },
  slideTitle: {
    ...Typography.screenTitle,
    fontSize: 26,
    textAlign: 'center',
    marginBottom: 12,
  },
  slideBody: {
    fontSize: 16,
    lineHeight: 24,
    color: Brand.textSecondary,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Brand.borderStrong,
  },
  dotActive: {
    backgroundColor: Brand.primary,
    width: 22,
  },
  nextButton: {
    width: '100%',
  },
  doneContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 4,
  },
  doneEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  doneTitle: {
    ...Typography.screenTitle,
    fontSize: 26,
    textAlign: 'center',
    marginBottom: 12,
  },
  doneBody: {
    fontSize: 16,
    lineHeight: 24,
    color: Brand.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  doneButton: {
    width: '100%',
  },
});

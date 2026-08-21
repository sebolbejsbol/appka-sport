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
import {
  ChatIcon,
  CheckCircleIcon,
  CompassIcon,
  PeopleIcon,
  PinIcon,
  TrophyIcon,
} from '@/components/icons';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow, Typography } from '@/constants/ui';
import { useSession } from '@/context/session';
import { t, type TKey } from '@/i18n';
import { supabase } from '@/lib/supabase';

type IconComponent = typeof CompassIcon;
type Slide = { Icon: IconComponent; color: string; titleKey: TKey; bodyKey: TKey };

const SLIDES: Slide[] = [
  { Icon: CompassIcon, color: Brand.primary, titleKey: 'onboarding.slide1Title', bodyKey: 'onboarding.slide1Body' },
  { Icon: PeopleIcon, color: Brand.pitch, titleKey: 'onboarding.slide2Title', bodyKey: 'onboarding.slide2Body' },
  { Icon: ChatIcon, color: Brand.teal, titleKey: 'onboarding.slide3Title', bodyKey: 'onboarding.slide3Body' },
  { Icon: PinIcon, color: Brand.amberDark, titleKey: 'onboarding.slide4Title', bodyKey: 'onboarding.slide4Body' },
  { Icon: TrophyIcon, color: '#C026D3', titleKey: 'onboarding.slide5Title', bodyKey: 'onboarding.slide5Body' },
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
        <View style={[styles.badge, { backgroundColor: Brand.pitch }]}>
          <CheckCircleIcon size={44} color="#ffffff" strokeWidth={2} />
        </View>
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

  const activeSlide = SLIDES[activeIndex];
  const nextSlide = SLIDES[(activeIndex + 1) % SLIDES.length];
  const prevSlide = SLIDES[(activeIndex + SLIDES.length - 1) % SLIDES.length];

  return (
    <View style={styles.flex1}>
      <View style={[styles.artCanvas, { paddingTop: insets.top }]}>
        <View style={[styles.artGlow, { backgroundColor: activeSlide.color }]} />

        <View style={[styles.pinSmall, styles.pinTopRight, { borderColor: nextSlide.color }]} />
        <View style={[styles.pinSmall, styles.pinBottomLeft, { borderColor: prevSlide.color }]} />

        <View style={[styles.pinMain, { borderColor: activeSlide.color }]}>
          <activeSlide.Icon size={34} color="#ffffff" strokeWidth={1.7} />
        </View>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.progressRow}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.titleKey}
              style={[styles.progressSeg, i <= activeIndex && styles.progressSegActive]}
            />
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}>
          {SLIDES.map((slide) => (
            <View key={slide.titleKey} style={{ width }}>
              <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
              <Text style={styles.slideBody}>{t(slide.bodyKey)}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footerRow}>
          <Pressable
            onPress={() => void finishOnboarding()}
            disabled={finishing}
            hitSlop={10}>
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </Pressable>
          <Pressable
            onPress={() => (isLastSlide ? setPhase('trial') : goToSlide(activeIndex + 1))}
            style={({ pressed }) => [styles.nextPill, pressed && styles.pressed]}>
            <Text style={styles.nextPillText}>
              {isLastSlide ? t('onboarding.tryIt') : t('onboarding.next')}
            </Text>
            <Text style={styles.nextArrow}>→</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  trialSkip: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  skipText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 14,
    color: Brand.textSecondary,
  },
  artCanvas: {
    flex: 1,
    backgroundColor: Brand.ink,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlow: {
    position: 'absolute',
    top: -80,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.3,
  },
  pinMain: {
    width: 108,
    height: 108,
    borderRadius: 999,
    borderWidth: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSmall: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 999,
    borderWidth: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pinTopRight: {
    top: '22%',
    right: '18%',
  },
  pinBottomLeft: {
    bottom: '20%',
    left: '16%',
  },
  sheet: {
    flexShrink: 0,
    backgroundColor: Brand.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 24,
    paddingHorizontal: 26,
    gap: 20,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
  },
  progressSeg: {
    height: 4,
    flex: 1,
    borderRadius: 999,
    backgroundColor: Brand.border,
  },
  progressSegActive: {
    backgroundColor: Brand.primary,
  },
  slideTitle: {
    fontFamily: BrandFonts.display,
    fontSize: 30,
    color: Brand.textPrimary,
    textTransform: 'uppercase',
    lineHeight: 32,
  },
  slideBody: {
    fontFamily: BrandFonts.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: Brand.textMuted,
    marginTop: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  nextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 26,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primary,
    ...shadow('sm'),
  },
  nextPillText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    color: '#ffffff',
  },
  nextArrow: {
    fontSize: 16,
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.88,
  },
  doneContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 4,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  doneTitle: {
    ...Typography.screenTitle,
    fontSize: 26,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  doneBody: {
    fontFamily: BrandFonts.body,
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

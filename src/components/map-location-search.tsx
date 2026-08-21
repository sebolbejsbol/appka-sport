import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CloseIcon, SearchIcon, SlidersIcon } from '@/components/icons';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { searchMapPlaces, type PlaceSearchResult } from '@/lib/map-geocoding';

const SEARCH_DEBOUNCE_MS = 280;
const BLUR_HIDE_MS = 180;

// Apka działa na razie tylko w Trójmieście (realna granica: migracja 0102,
// public.tricity_boundary) — podpowiedzi ograniczone do miast, które faktycznie da się wybrać.
const EXAMPLE_QUERIES = ['Gdańsk', 'Gdynia', 'Sopot'] as const;

type Props = {
  topOffset: number;
  onSelectPlace: (place: PlaceSearchResult) => void;
  onFilterPress?: () => void;
  filterActiveCount?: number;
};

export function MapLocationSearch({
  topOffset,
  onSelectPlace,
  onFilterPress,
  filterActiveCount,
}: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(false);
    const { data, error } = await searchMapPlaces(trimmed);
    setResults(data);
    setSearchError(error);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!focused) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [focused, query, runSearch]);

  function handleFocus() {
    if (blurRef.current) clearTimeout(blurRef.current);
    setFocused(true);
  }

  function handleBlur() {
    blurRef.current = setTimeout(() => setFocused(false), BLUR_HIDE_MS);
  }

  function handleSelect(place: PlaceSearchResult) {
    if (blurRef.current) clearTimeout(blurRef.current);
    setQuery(place.subtitle ?? place.label);
    setFocused(false);
    Keyboard.dismiss();
    onSelectPlace(place);
  }

  function handleExample(example: string) {
    setQuery(example);
    void runSearch(example);
  }

  const showDropdown = focused;
  const trimmedQuery = query.trim();
  const showExamples = trimmedQuery.length < 2;
  const showResults = trimmedQuery.length >= 2;

  return (
    <View style={[styles.anchor, { top: topOffset }]} pointerEvents="box-none">
      <View style={styles.row}>
        <View style={styles.searchColumn}>
          <View style={styles.bar}>
            <SearchIcon size={18} color={Brand.textSecondary} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={t('map.locationSearchPlaceholder')}
              placeholderTextColor={Brand.textMuted}
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
              accessibilityLabel={t('map.locationSearchTitle')}
            />
            {Platform.OS !== 'ios' && query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} style={styles.clearBtn}>
                <CloseIcon size={14} color={Brand.textMuted} />
              </Pressable>
            ) : null}
            {searching ? (
              <ActivityIndicator color={Brand.primary} size="small" style={styles.spinner} />
            ) : null}
          </View>

          {showDropdown ? (
            <View style={styles.dropdown}>
              <Text style={styles.dropdownLead}>{t('map.locationSearchLead')}</Text>

              {showExamples ? (
                <View style={styles.examplesBlock}>
                  <Text style={styles.examplesTitle}>{t('map.locationSearchExamples')}</Text>
                  <View style={styles.examplesRow}>
                    {EXAMPLE_QUERIES.map((example) => (
                      <Pressable
                        key={example}
                        onPress={() => handleExample(example)}
                        style={({ pressed }) => [styles.exampleChip, pressed && styles.pressed]}>
                        <Text style={styles.exampleChipText}>{example}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.hint}>{t('map.locationSearchHint')}</Text>
                </View>
              ) : null}

              {showResults && searchError ? (
                <Text style={styles.hint}>{t('map.locationSearchError')}</Text>
              ) : null}

              {showResults && !searchError && !searching && results.length === 0 ? (
                <Text style={styles.hint}>{t('map.locationSearchEmpty')}</Text>
              ) : null}

              {showResults && results.length > 0 ? (
                <ScrollView
                  style={styles.resultsScroll}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}>
                  {results.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => handleSelect(item)}
                      style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}>
                      <Text style={styles.resultLabel}>{item.label}</Text>
                      {item.subtitle ? (
                        <Text style={styles.resultSubtitle} numberOfLines={2}>
                          {item.subtitle}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ) : null}
        </View>

        {onFilterPress ? (
          <Pressable
            onPress={onFilterPress}
            style={({ pressed }) => [styles.filterBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('map.filtersButton')}>
            <SlidersIcon size={18} color={Brand.textPrimary} />
            {filterActiveCount ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>
                  {filterActiveCount > 9 ? '9+' : filterActiveCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 28,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  searchColumn: {
    flex: 1,
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Brand.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...shadow('float'),
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Brand.surface,
  },
  filterBadgeText: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 10,
    color: Brand.primaryText,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Brand.surface,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 4,
    minHeight: 46,
    ...shadow('float'),
  },
  input: {
    flex: 1,
    fontFamily: BrandFonts.body,
    fontSize: 15,
    color: Brand.textPrimary,
    paddingVertical: 8,
  },
  spinner: {
    marginRight: 4,
  },
  clearBtn: {
    padding: 4,
  },
  dropdown: {
    marginTop: 8,
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxHeight: 320,
    ...shadow('md'),
  },
  dropdownLead: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  examplesBlock: {
    gap: 8,
  },
  examplesTitle: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0.2,
    color: Brand.textMuted,
    textTransform: 'uppercase',
  },
  examplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exampleChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primaryLight,
    borderWidth: 1,
    borderColor: Brand.primaryMuted,
  },
  exampleChipText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    color: Brand.primaryDark,
  },
  hint: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textMuted,
    lineHeight: 18,
    marginTop: 4,
  },
  resultsScroll: {
    maxHeight: 220,
    marginTop: 4,
  },
  resultRow: {
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderBottomColor: Brand.border,
  },
  resultLabel: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 15,
    color: Brand.textPrimary,
  },
  resultSubtitle: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.88,
  },
});

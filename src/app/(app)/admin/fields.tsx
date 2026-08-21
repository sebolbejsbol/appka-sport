import { useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { Brand, BrandFonts } from '@/constants/theme';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import {
  getAdminFieldsQueue,
  getAdminNearbyFields,
  moderateField,
  setFieldPhoto,
  type AdminFieldItem,
  type AdminFieldStatus,
  type NearbyFieldItem,
} from '@/lib/admin-fields';
import { formatCourtName } from '@/lib/field-display';
import { uploadFieldPhoto } from '@/lib/field-storage';
import { formatDistance } from '@/lib/geo';
import { requestMapFieldsRefresh } from '@/lib/map-field-sync';
import { goBack } from '@/lib/navigation';
import { pickImageFromLibrary } from '@/lib/pick-image';
import { getProfileAdminFlag } from '@/lib/profiles';

const FILTERS: AdminFieldStatus[] = ['pending', 'approved', 'rejected'];

type ModerationMode = 'approve' | 'reject';

export default function AdminFieldsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<AdminFieldStatus>('pending');
  const [fields, setFields] = useState<AdminFieldItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [moderationTarget, setModerationTarget] = useState<AdminFieldItem | null>(null);
  const [moderationMode, setModerationMode] = useState<ModerationMode>('approve');
  const [approveName, setApproveName] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [nearbyFields, setNearbyFields] = useState<NearbyFieldItem[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [moderateBusy, setModerateBusy] = useState(false);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    let active = true;
    getProfileAdminFlag(userId).then(({ isAdmin: admin }) => {
      if (active) setIsAdmin(admin);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setLoadError(false);
    setActionError(null);
    const { data, error } = await getAdminFieldsQueue(filter);
    setFields(data);
    setLoadError(Boolean(error));
    setLoading(false);
  }, [filter, isAdmin]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [filter, isAdmin, load]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  async function loadNearby(fieldId: string) {
    setNearbyLoading(true);
    const { data } = await getAdminNearbyFields(fieldId);
    setNearbyFields(data);
    setNearbyLoading(false);
  }

  function openModeration(field: AdminFieldItem, mode: ModerationMode) {
    setModerationTarget(field);
    setModerationMode(mode);
    setApproveName(field.name?.trim() ?? '');
    setRejectNote('');
    setNearbyFields([]);
    setActionError(null);
    void loadNearby(field.id);
  }

  function closeModeration() {
    if (moderateBusy) return;
    setModerationTarget(null);
    setApproveName('');
    setRejectNote('');
    setNearbyFields([]);
  }

  function duplicateNote(name: string, distanceM: number): string {
    return t('adminFields.duplicateNote')
      .replace('{name}', name)
      .replace('{distance}', formatDistance(distanceM));
  }

  async function submitModeration(
    status: 'approved' | 'rejected',
    options: { name?: string; adminNote?: string } = {},
  ) {
    if (!moderationTarget) return;

    setModerateBusy(true);
    setActionError(null);
    const result = await moderateField(moderationTarget.id, status, options);
    setModerateBusy(false);

    if (result === 'ok') {
      setFields((prev) => prev.filter((f) => f.id !== moderationTarget.id));
      closeModeration();
      return;
    }

    if (result === 'not_admin') {
      setActionError(t('adminFields.notAdmin'));
      setIsAdmin(false);
      closeModeration();
      return;
    }
    if (result === 'not_found') {
      setActionError(t('adminFields.notFound'));
      closeModeration();
      void load();
      return;
    }
    if (result === 'invalid') {
      setActionError(t('adminFields.invalidInput'));
      return;
    }
    setActionError(t('adminFields.actionError'));
  }

  function handleApproveConfirm() {
    void submitModeration('approved', { name: approveName });
  }

  function handleRejectConfirm() {
    void submitModeration('rejected', { adminNote: rejectNote });
  }

  function handleRejectDuplicate(nearby: NearbyFieldItem) {
    const name = formatCourtName(nearby.name);
    setRejectNote(duplicateNote(name, nearby.distance_m));
    void submitModeration('rejected', {
      adminNote: duplicateNote(name, nearby.distance_m),
    });
  }

  function openOnMap(field: AdminFieldItem) {
    const url = `https://www.google.com/maps?q=${field.lat},${field.lng}`;
    void Linking.openURL(url);
  }

  async function handlePickPhoto(field: AdminFieldItem) {
    const picked = await pickImageFromLibrary({ aspect: [16, 9] });
    if (!picked) return;

    setActionError(null);
    setPhotoBusyId(field.id);
    const { publicUrl, error: uploadError } = await uploadFieldPhoto(
      field.id,
      picked.uri,
      picked.mimeType,
      picked.base64,
    );
    if (uploadError || !publicUrl) {
      setPhotoBusyId(null);
      setActionError(t('adminFields.photoError'));
      return;
    }

    const { error: saveError } = await setFieldPhoto(field.id, publicUrl);
    setPhotoBusyId(null);
    if (saveError) {
      setActionError(t('adminFields.photoError'));
      return;
    }

    setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, photo_url: publicUrl } : f)));
    requestMapFieldsRefresh();
  }

  function filterLabel(key: AdminFieldStatus): string {
    switch (key) {
      case 'pending':
        return t('adminFields.filterPending');
      case 'approved':
        return t('adminFields.filterApproved');
      case 'rejected':
        return t('adminFields.filterRejected');
    }
  }

  function emptyLabel(key: AdminFieldStatus): string {
    switch (key) {
      case 'pending':
        return t('adminFields.emptyPending');
      case 'approved':
        return t('adminFields.emptyApproved');
      case 'rejected':
        return t('adminFields.emptyRejected');
    }
  }

  if (isAdmin === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => goBack('/admin' as Href)} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('adminFields.title')}</Text>
        <Text style={styles.muted}>{t('adminFields.notAdmin')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Pressable onPress={() => goBack('/admin' as Href)} hitSlop={12} style={styles.backButton}>
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </Pressable>

      <Text style={styles.title}>{t('adminFields.title')}</Text>
      <Text style={styles.hint}>{t('adminFields.hint')}</Text>

      <View style={styles.filtersRow}>
        {FILTERS.map((key) => {
          const active = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {filterLabel(key)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('adminFields.loadError')}</Text>
      ) : fields.length === 0 ? (
        <Text style={styles.muted}>{emptyLabel(filter)}</Text>
      ) : (
        <FlatList
          data={fields}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <FieldRow
              field={item}
              showActions={filter === 'pending'}
              showPhotoAction={filter === 'approved'}
              photoBusy={photoBusyId === item.id}
              onApprove={() => openModeration(item, 'approve')}
              onReject={() => openModeration(item, 'reject')}
              onMap={() => openOnMap(item)}
              onPickPhoto={() => void handlePickPhoto(item)}
            />
          )}
        />
      )}

      <ModerationModal
        visible={moderationTarget != null}
        mode={moderationMode}
        field={moderationTarget}
        approveName={approveName}
        rejectNote={rejectNote}
        nearbyFields={nearbyFields}
        nearbyLoading={nearbyLoading}
        busy={moderateBusy}
        onChangeApproveName={setApproveName}
        onChangeRejectNote={setRejectNote}
        onClose={closeModeration}
        onApprove={handleApproveConfirm}
        onReject={handleRejectConfirm}
        onRejectDuplicate={handleRejectDuplicate}
        onOpenMap={(field) => openOnMap(field)}
      />
    </View>
  );
}

type RowProps = {
  field: AdminFieldItem;
  showActions: boolean;
  showPhotoAction: boolean;
  photoBusy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onMap: () => void;
  onPickPhoto: () => void;
};

function FieldRow({
  field,
  showActions,
  showPhotoAction,
  photoBusy,
  onApprove,
  onReject,
  onMap,
  onPickPhoto,
}: RowProps) {
  const courtName = formatCourtName(field.name);
  const sportLabel = field.sport?.trim() || t('field.sports.basketball');
  const sourceLabel =
    field.source === 'osm' ? t('adminFields.sourceOsm') : t('adminFields.sourceUser');

  return (
    <View style={styles.row}>
      {field.photo_url ? <Image source={{ uri: field.photo_url }} style={styles.rowPhoto} /> : null}
      <Pressable style={styles.rowMain} onPress={onMap}>
        <Text style={styles.rowCourt}>{courtName}</Text>
        {field.name && field.name !== courtName ? (
          <Text style={styles.rowRawName}>{field.name}</Text>
        ) : null}
        <Text style={styles.rowMeta}>
          {sportLabel} · {sourceLabel}
        </Text>
        {field.submitted_by_nick ? (
          <Text style={styles.rowMeta}>
            {t('adminFields.submittedBy')}: {field.submitted_by_nick}
          </Text>
        ) : null}
        {field.user_note ? (
          <Text style={styles.rowNote}>
            {t('adminFields.userNote')}: {field.user_note}
          </Text>
        ) : null}
        {field.admin_note ? (
          <Text style={styles.rowAdminNote}>
            {t('adminFields.adminNote')}: {field.admin_note}
          </Text>
        ) : null}
        <Text style={styles.mapLink}>{t('adminFields.openMap')} ›</Text>
      </Pressable>

      <View style={styles.rowActions}>
        {showActions ? (
          <>
            <Pressable
              style={({ pressed }) => [styles.approveBtn, pressed && styles.pressed]}
              onPress={onApprove}>
              <Text style={styles.approveBtnText}>{t('adminFields.approve')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed]}
              onPress={onReject}>
              <Text style={styles.rejectBtnText}>{t('adminFields.reject')}</Text>
            </Pressable>
          </>
        ) : null}
        {showPhotoAction ? (
          photoBusy ? (
            <ActivityIndicator color={Brand.primary} />
          ) : (
            <Pressable
              style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
              onPress={onPickPhoto}>
              <Text style={styles.photoBtnText}>
                {field.photo_url ? t('adminFields.photoChange') : t('adminFields.photoAdd')}
              </Text>
            </Pressable>
          )
        ) : null}
      </View>
    </View>
  );
}

type ModalProps = {
  visible: boolean;
  mode: ModerationMode;
  field: AdminFieldItem | null;
  approveName: string;
  rejectNote: string;
  nearbyFields: NearbyFieldItem[];
  nearbyLoading: boolean;
  busy: boolean;
  onChangeApproveName: (value: string) => void;
  onChangeRejectNote: (value: string) => void;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRejectDuplicate: (nearby: NearbyFieldItem) => void;
  onOpenMap: (field: AdminFieldItem) => void;
};

function ModerationModal({
  visible,
  mode,
  field,
  approveName,
  rejectNote,
  nearbyFields,
  nearbyLoading,
  busy,
  onChangeApproveName,
  onChangeRejectNote,
  onClose,
  onApprove,
  onReject,
  onRejectDuplicate,
  onOpenMap,
}: ModalProps) {
  const insets = useSafeAreaInsets();

  if (!field) return null;

  const courtName = formatCourtName(field.name);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            { paddingBottom: insets.bottom + 16, maxHeight: '88%' },
          ]}>
          <Text style={styles.modalTitle}>
            {mode === 'approve' ? t('adminFields.approve') : t('adminFields.rejectTitle')}
          </Text>
          <Text style={styles.modalSubtitle}>{courtName}</Text>

          {mode === 'approve' ? (
            <>
              <Text style={styles.modalHint}>{t('adminFields.editNameHint')}</Text>
              <TextField
                label={t('adminFields.editNameTitle')}
                value={approveName}
                onChangeText={onChangeApproveName}
                maxLength={120}
                editable={!busy}
              />
            </>
          ) : (
            <>
              <Text style={styles.modalHint}>{t('adminFields.rejectHint')}</Text>
              <TextField
                label={t('adminFields.adminNote')}
                value={rejectNote}
                onChangeText={onChangeRejectNote}
                maxLength={400}
                placeholder={t('adminFields.rejectReasonPlaceholder')}
                editable={!busy}
                multiline
              />
            </>
          )}

          <NearbySection
            nearbyFields={nearbyFields}
            loading={nearbyLoading}
            busy={busy}
            onRejectDuplicate={onRejectDuplicate}
          />

          <View style={styles.modalActions}>
            <Button label={t('common.cancel')} variant="secondary" onPress={onClose} disabled={busy} />
            {mode === 'approve' ? (
              <Button
                label={t('adminFields.confirmApprove')}
                onPress={onApprove}
                disabled={busy || approveName.trim().length < 2}
              />
            ) : (
              <Button
                label={t('adminFields.confirmReject')}
                onPress={onReject}
                disabled={busy}
                style={styles.rejectModalBtn}
              />
            )}
          </View>

          <Pressable onPress={() => onOpenMap(field)} disabled={busy}>
            <Text style={styles.modalMapLink}>{t('adminFields.openMap')} ›</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

type NearbyProps = {
  nearbyFields: NearbyFieldItem[];
  loading: boolean;
  busy: boolean;
  onRejectDuplicate: (nearby: NearbyFieldItem) => void;
};

function NearbySection({ nearbyFields, loading, busy, onRejectDuplicate }: NearbyProps) {
  return (
    <View style={styles.nearbySection}>
      <Text style={styles.nearbyTitle}>{t('adminFields.nearbyTitle')}</Text>
      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.nearbyLoader} />
      ) : nearbyFields.length === 0 ? (
        <Text style={styles.nearbyEmpty}>{t('adminFields.nearbyEmpty')}</Text>
      ) : (
        nearbyFields.map((nearby) => {
          const name = formatCourtName(nearby.name);
          return (
            <View key={nearby.id} style={styles.nearbyRow}>
              <View style={styles.nearbyMain}>
                <Text style={styles.nearbyName}>{name}</Text>
                <Text style={styles.nearbyDistance}>
                  {t('adminFields.nearbyDistance')}: {formatDistance(nearby.distance_m)}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.duplicateBtn, pressed && styles.pressed]}
                onPress={() => onRejectDuplicate(nearby)}
                disabled={busy}>
                <Text style={styles.duplicateBtnText}>{t('adminFields.rejectAsDuplicate')}</Text>
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: Brand.screenBackground,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backText: {
    fontFamily: BrandFonts.body,
    fontSize: 16,
    color: Brand.textSecondary,
  },
  title: {
    fontFamily: BrandFonts.display,
    fontSize: 32,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginBottom: 8,
  },
  hint: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textMuted,
    marginBottom: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  filterChipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  filterChipText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  filterChipTextActive: {
    color: Brand.primaryText,
  },
  loader: {
    marginTop: 32,
  },
  muted: {
    fontFamily: BrandFonts.body,
    fontSize: 15,
    color: Brand.textMuted,
    marginTop: 24,
  },
  errorText: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.danger,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  rowMain: {
    flex: 1,
  },
  rowActions: {
    gap: 8,
    paddingTop: 2,
  },
  rowPhoto: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: Brand.surfaceMuted,
  },
  photoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.primary,
    backgroundColor: Brand.surface,
  },
  photoBtnText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 12,
    fontWeight: '600',
    color: Brand.primary,
  },
  rowCourt: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  rowRawName: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textSecondary,
    marginTop: 2,
  },
  rowMeta: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textSecondary,
    marginTop: 4,
  },
  rowNote: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textPrimary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  rowAdminNote: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.danger,
    marginTop: 4,
  },
  mapLink: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primary,
    marginTop: 6,
  },
  approveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.primary,
  },
  approveBtnText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 12,
    fontWeight: '600',
    color: Brand.primaryText,
  },
  rejectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.danger,
    backgroundColor: Brand.surface,
  },
  rejectBtnText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 12,
    fontWeight: '600',
    color: Brand.danger,
  },
  pressed: {
    opacity: 0.8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Brand.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  modalTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 22,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  modalSubtitle: {
    fontFamily: BrandFonts.body,
    fontSize: 16,
    color: Brand.textSecondary,
  },
  modalHint: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textMuted,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  rejectModalBtn: {
    backgroundColor: Brand.danger,
  },
  modalMapLink: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.primary,
    textAlign: 'center',
    paddingVertical: 4,
  },
  nearbySection: {
    marginTop: 4,
    gap: 8,
  },
  nearbyTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  nearbyLoader: {
    alignSelf: 'flex-start',
  },
  nearbyEmpty: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textMuted,
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
  },
  nearbyMain: {
    flex: 1,
  },
  nearbyName: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  nearbyDistance: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 2,
  },
  duplicateBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.danger,
  },
  duplicateBtnText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 11,
    fontWeight: '600',
    color: Brand.danger,
  },
});

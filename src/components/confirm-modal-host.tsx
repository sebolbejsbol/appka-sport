import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { registerConfirmHost, type ConfirmRequest } from '@/lib/confirm-navigation';

/**
 * Host modala potwierdzenia dla web. Montowany wysoko w drzewie (obok
 * <LegalDocumentHost />), żeby confirmAction() na webie mógł pokazać
 * prawdziwe etykiety przycisków zamiast generycznego OK/Anuluj z
 * window.confirm().
 */
export function ConfirmModalHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    registerConfirmHost((next) => setRequest(next));
    return () => registerConfirmHost(null);
  }, []);

  const close = () => setRequest(null);

  function handleConfirm() {
    const onConfirm = request?.onConfirm;
    close();
    onConfirm?.();
  }

  return (
    <Modal visible={request !== null} transparent animationType="fade" onRequestClose={close}>
      {request ? (
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>{request.title}</Text>
            {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
            <View style={styles.actions}>
              <Button label={request.cancelLabel} variant="secondary" onPress={close} style={styles.btn} />
              <Button
                label={request.confirmLabel}
                variant={request.destructive ? 'danger' : 'primary'}
                onPress={handleConfirm}
                style={styles.btn}
              />
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Brand.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 17, fontWeight: '700', fontFamily: BrandFonts.bodyBold, color: Brand.textPrimary },
  message: { fontSize: 14, fontFamily: BrandFonts.body, color: Brand.textSecondary, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1 },
});

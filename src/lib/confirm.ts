import { Alert, Platform } from 'react-native';

import { requestConfirm } from '@/lib/confirm-navigation';

export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string,
  onConfirm: () => void,
  destructive = false,
): void {
  if (Platform.OS === 'web') {
    // window.confirm() only shows generic OK/Cancel and can't display the
    // real confirmLabel/cancelLabel, so route through the custom modal host
    // (<ConfirmModalHost />, mounted in the root layout) instead.
    requestConfirm({ title, message, confirmLabel, cancelLabel, destructive, onConfirm });
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

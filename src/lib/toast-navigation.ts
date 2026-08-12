// Emitter pattern, same as confirm-navigation.ts / legal-navigation.ts.
// A lightweight cross-platform toast replaces bare Alert.alert(message) calls,
// which are a complete no-op on react-native-web and also don't match the
// "small toast/snackbar" feedback style the app wants for simple notices.
export type ToastVariant = 'success' | 'error' | 'info';

export type ToastRequest = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type Listener = (request: Omit<ToastRequest, 'id'>) => void;

let activeListener: Listener | null = null;

export function registerToastHost(listener: Listener | null): void {
  activeListener = listener;
}

export function showToast(message: string, variant: ToastVariant = 'info'): void {
  if (activeListener) {
    activeListener({ message, variant });
  }
}

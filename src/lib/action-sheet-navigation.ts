// Emitter pattern, same as confirm-navigation.ts. Replaces multi-button
// Alert.alert(title, message, [...]) calls (e.g. a reason picker), which are
// a complete no-op on react-native-web and don't match the app's branded
// modal style anyway.
export type ActionSheetOption = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

export type ActionSheetRequest = {
  title: string;
  message?: string;
  options: ActionSheetOption[];
  cancelLabel: string;
};

type Listener = (request: ActionSheetRequest) => void;

let activeListener: Listener | null = null;

export function registerActionSheetHost(listener: Listener | null): void {
  activeListener = listener;
}

export function showActionSheet(request: ActionSheetRequest): void {
  if (activeListener) {
    activeListener(request);
  }
}

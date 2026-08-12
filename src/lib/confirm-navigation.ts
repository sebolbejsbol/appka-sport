// Web-only confirm dialog host, same emitter pattern as legal-navigation.ts.
// window.confirm() only ever shows generic OK/Cancel buttons - it cannot
// display the real confirmLabel/cancelLabel text, so destructive actions
// like "Remove" or "Withdraw" lost their label on web. This routes web
// confirms through a custom <Modal /> (registered by <ConfirmModalHost />)
// that renders the actual button labels instead.
export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  onConfirm: () => void;
};

type Listener = (request: ConfirmRequest) => void;

let activeListener: Listener | null = null;

export function registerConfirmHost(listener: Listener | null): void {
  activeListener = listener;
}

export function requestConfirm(request: ConfirmRequest): void {
  if (activeListener) {
    activeListener(request);
  }
}

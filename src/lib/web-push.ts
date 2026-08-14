// Web Push (VAPID) — rejestracja service workera i subskrypcji przeglądarki.
// Tylko dla web: natywne iOS/Android mają Expo Push (patrz push-notifications.ts),
// który tu NIE jest dotykany. Ten moduł jest bezpieczny do zaimportowania
// wszędzie (funkcje same sprawdzają dostępność API), ale ma sens tylko przy
// Platform.OS === 'web'.
import { removeWebPushSubscription, saveWebPushSubscription } from '@/lib/profiles';
import { routeForPushData } from '@/lib/push-notifications';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const SW_URL = '/push-sw.js';

export type WebPushSupport = 'supported' | 'unsupported' | 'no-vapid-key';

export function webPushSupport(): WebPushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (!VAPID_PUBLIC_KEY) return 'no-vapid-key';
  return 'supported';
}

export function getWebPushPermissionState(): 'granted' | 'denied' | 'undetermined' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'undetermined';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'undetermined';
}

// VAPID public key przychodzi jako base64url — Push API chce Uint8Array.
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function subscriptionKeys(sub: PushSubscription): { p256dh: string; auth: string } | null {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) return null;
  return { p256dh, auth };
}

export type WebPushEnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'no-vapid-key' | 'permission_denied' | 'error' };

export async function enableWebPush(): Promise<WebPushEnableResult> {
  const support = webPushSupport();
  if (support !== 'supported') return { ok: false, reason: support };

  try {
    const registration = await navigator.serviceWorker.register(SW_URL);
    await navigator.serviceWorker.ready;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return { ok: false, reason: 'permission_denied' };

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const keys = subscriptionKeys(subscription);
    if (!keys) return { ok: false, reason: 'error' };

    const { error } = await saveWebPushSubscription(subscription.endpoint, keys.p256dh, keys.auth);
    if (error) return { ok: false, reason: 'error' };

    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function disableWebPush(): Promise<void> {
  if (webPushSupport() === 'unsupported') return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await removeWebPushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    }
  } catch {
    // best-effort — jeśli przeglądarka już nic nie ma zarejestrowane, nie ma czego czyścić
  }
}

/** Czy przeglądarka ma już aktywną subskrypcję (np. po odświeżeniu strony). */
export async function hasActiveWebPushSubscription(): Promise<boolean> {
  if (webPushSupport() === 'unsupported') return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

let clickListenerBound = false;

/** Nawigacja po kliknięciu w powiadomienie systemowe (patrz notificationclick w public/push-sw.js). */
export function bindWebPushClickRouting(): void {
  if (clickListenerBound || webPushSupport() === 'unsupported') return;
  clickListenerBound = true;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'push-notification-click') {
      routeForPushData((event.data.data ?? {}) as Record<string, unknown>);
    }
  });
}

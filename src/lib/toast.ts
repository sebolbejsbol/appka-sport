import { showToast } from '@/lib/toast-navigation';

export function notifySuccess(message: string): void {
  showToast(message, 'success');
}

export function notifyError(message: string): void {
  showToast(message, 'error');
}

export function notifyInfo(message: string): void {
  showToast(message, 'info');
}

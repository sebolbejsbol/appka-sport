import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@appka-sport/notifications-enabled';

export async function getNotificationsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (value === null) return false;
  return value === '1';
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
}

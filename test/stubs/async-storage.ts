// In-memory stand-in for @react-native-async-storage/async-storage under vitest.
const storage = new Map<string, string>();

export default {
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: async (key: string) => {
    storage.delete(key);
  },
};

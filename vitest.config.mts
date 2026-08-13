import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

// Pure-logic unit tests only (no React Native rendering) — see test/stubs/
// for why react-native/async-storage/CSS need stand-ins to run under Node.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: [
      { find: '@/global.css', replacement: path.resolve(root, 'test/stubs/empty-module.ts') },
      {
        find: '@react-native-async-storage/async-storage',
        replacement: path.resolve(root, 'test/stubs/async-storage.ts'),
      },
      { find: 'react-native', replacement: path.resolve(root, 'test/stubs/react-native.ts') },
      { find: '@', replacement: path.resolve(root, 'src') },
    ],
  },
});

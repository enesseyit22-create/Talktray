import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK = 1800;
const memory = new Map<string, string>();

async function readChunks(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return memory.get(key) ?? null;
  const countRaw = await SecureStore.getItemAsync(`${key}.n`);
  if (!countRaw) return null;
  const count = Number(countRaw);
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += (await SecureStore.getItemAsync(`${key}.${i}`)) ?? '';
  }
  return out || null;
}

async function writeChunks(key: string, value: string) {
  if (typeof window === 'undefined') {
    memory.set(key, value);
    return;
  }
  const count = Math.max(1, Math.ceil(value.length / CHUNK));
  const previous = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
  for (let i = 0; i < count; i += 1) {
    await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  for (let i = count; i < previous; i += 1) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
  await SecureStore.setItemAsync(`${key}.n`, String(count));
}

const memoryStorage = {
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: async (key: string) => {
    memory.delete(key);
  },
};

function nativeStorage() {
  return {
    getItem: (key: string) => readChunks(key),
    setItem: (key: string, value: string) => writeChunks(key, value),
    removeItem: async (key: string) => {
      if (typeof window === 'undefined') {
        memory.delete(key);
        return;
      }
      const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
      for (let i = 0; i < count; i += 1) await SecureStore.deleteItemAsync(`${key}.${i}`);
      await SecureStore.deleteItemAsync(`${key}.n`);
    },
  };
}

const useSecureStore = (Platform.OS === 'ios' || Platform.OS === 'android') && typeof window !== 'undefined';

export const authStorage = useSecureStore
  ? nativeStorage()
  : typeof window === 'undefined'
    ? memoryStorage
    : {
        getItem: (key: string) => AsyncStorage.getItem(key),
        setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
        removeItem: (key: string) => AsyncStorage.removeItem(key),
      };

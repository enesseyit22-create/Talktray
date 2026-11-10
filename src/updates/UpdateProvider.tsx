import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

export type UpdateStatus = 'idle' | 'checking' | 'ready' | 'current' | 'unavailable' | 'error';

type UpdateValue = {
  status: UpdateStatus;
  version: string;
  updateId: string;
  channel: string | null;
  runtimeVersion: string | null;
  promptVisible: boolean;
  check: (force?: boolean) => Promise<void>;
  restart: () => Promise<void>;
  dismiss: () => void;
};

const UpdateContext = createContext<UpdateValue | null>(null);

function updatesEnabled() {
  return Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>(updatesEnabled() ? 'idle' : 'unavailable');
  const [promptVisible, setPromptVisible] = useState(false);
  const statusRef = useRef(status);

  const check = useCallback(async (force = false) => {
    if (!updatesEnabled()) {
      setStatus('unavailable');
      return;
    }
    if (!force && (statusRef.current === 'checking' || statusRef.current === 'ready')) return;
    setStatus('checking');
    statusRef.current = 'checking';
    try {
      const available = await Updates.checkForUpdateAsync();
      if (!available.isAvailable) {
        setStatus('current');
        statusRef.current = 'current';
        return;
      }
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        setStatus('ready');
        statusRef.current = 'ready';
        setPromptVisible(true);
      } else {
        setStatus('current');
        statusRef.current = 'current';
      }
    } catch {
      setStatus('error');
      statusRef.current = 'error';
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void check();
    }, 400);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void check();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [check]);

  const value = useMemo<UpdateValue>(
    () => ({
      status,
      version: Constants.expoConfig?.version ?? '1.0.0',
      updateId: Updates.updateId ?? 'embedded',
      channel: Updates.channel,
      runtimeVersion: Updates.runtimeVersion,
      promptVisible,
      check,
      restart: async () => {
        if (!updatesEnabled()) return;
        await Updates.reloadAsync();
      },
      dismiss: () => setPromptVisible(false),
    }),
    [check, promptVisible, status],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdates() {
  const value = useContext(UpdateContext);
  if (!value) throw new Error('useUpdates must be used within UpdateProvider');
  return value;
}

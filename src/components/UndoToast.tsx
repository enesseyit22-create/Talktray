import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';

const HOLD_MS = 2000;

type Pending = {
  itemIds: string[];
  recordingIds: string[];
  commit: () => Promise<void>;
};

/** Hides rows immediately and commits the delete after a short undo window. */
export function useUndoDelete(remove: {
  deleteItem: (id: string) => Promise<void>;
  deleteRecording?: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    setVisible(false);
    if (current) void current.commit();
  };

  const arm = (next: Omit<Pending, 'commit'> & { commit: () => Promise<void> }) => {
    if (pendingRef.current) {
      const previous = pendingRef.current;
      pendingRef.current = null;
      void previous.commit();
    }
    if (timer.current) clearTimeout(timer.current);
    pendingRef.current = next;
    setPending(next);
    setVisible(true);
    timer.current = setTimeout(flush, HOLD_MS);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return {
    hiddenItemIds: pending?.itemIds ?? [],
    hiddenRecordingIds: pending?.recordingIds ?? [],
    visible,
    undo: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pendingRef.current = null;
      setPending(null);
      setVisible(false);
    },
    dismiss: flush,
    removeItem: (id: string) =>
      arm({
        itemIds: [id],
        recordingIds: [],
        commit: () => remove.deleteItem(id),
      }),
    removeRecording: (id: string, linkedItemIds: string[]) =>
      arm({
        itemIds: linkedItemIds,
        recordingIds: [id],
        commit: () => remove.deleteRecording?.(id) ?? Promise.resolve(),
      }),
  };
}

export function UndoToast({
  visible,
  bottom,
  onUndo,
  onDismiss,
}: {
  visible: boolean;
  bottom: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12,
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) > 36) onDismiss();
    },
  });
  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom }}>
      <Pressable onPress={onDismiss} {...pan.panHandlers}>
        <View
          style={{
            minHeight: 48,
            borderRadius: 16,
            paddingHorizontal: 16,
            backgroundColor: 'rgba(32, 27, 46, 0.94)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <AppText color="#fff" weight="semibold">
            {t('toast.deleted')}
          </AppText>
          <Pressable
            onPress={onUndo}
            hitSlop={8}
            style={{ minHeight: 36, justifyContent: 'center' }}
          >
            <AppText color="#F5C16C" weight="bold">
              {t('toast.undo')}
            </AppText>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

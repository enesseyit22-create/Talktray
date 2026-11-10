import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { APP_GROUP } from '@/lib/config';

type CaptureModule = {
  setSnapshot: (todayCount: number, openTasks: number) => void;
};

const android = requireOptionalNativeModule<CaptureModule>('TalktrayCapture');

export function syncWidgets(snapshot: { todayCount: number; openTasks: number }) {
  if (Platform.OS === 'android') {
    android?.setSnapshot(snapshot.todayCount, snapshot.openTasks);
    return;
  }
  if (Platform.OS !== 'ios') return;
  void import('@bacons/apple-targets')
    .then((mod) => {
      const storage = new mod.ExtensionStorage(APP_GROUP);
      storage.set('todayCount', snapshot.todayCount);
      storage.set('openTasks', snapshot.openTasks);
      mod.ExtensionStorage.reloadWidget();
    })
    .catch(() => undefined);
}

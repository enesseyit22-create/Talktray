import { requireOptionalNativeModule } from 'expo-modules-core';

type CaptureModule = {
  setSnapshot: (todayCount: number, openTasks: number) => void;
};

const native = requireOptionalNativeModule<CaptureModule>('TalktrayCapture');

export function setAndroidWidgetSnapshot(todayCount: number, openTasks: number) {
  native?.setSnapshot(todayCount, openTasks);
}

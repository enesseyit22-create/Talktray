import { Redirect, Stack, router } from 'expo-router';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaptureProvider } from '@/capture/CaptureProvider';
import { AppText } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { armAutoRecord, hasPendingRecord } from '@/lib/record-signal';
import { listenForNotificationTaps, openNotificationTarget } from '@/services/notifications';
import { isRecordLink } from '../../../shared/parse/links';

export default function AppLayout() {
  const { ready, user, banner, clearBanner } = useApp();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  useQuickActionRouting((action) => {
    if (action.id === 'record') armAutoRecord();
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void QuickActions.setItems([
      {
        id: 'record',
        title: t('quick.title'),
        subtitle: t('quick.subtitle'),
        icon: Platform.OS === 'ios' ? 'symbol:mic.fill' : undefined,
        params: { href: '/record?autostart=1' },
      },
    ]).catch(() => undefined);
  }, [t]);

  useEffect(() => {
    if (!user || !hasPendingRecord()) return;
    router.navigate('/record?autostart=1');
  }, [user]);

  useEffect(() => {
    const open = (url: string | null) => {
      if (!isRecordLink(url)) return;
      armAutoRecord();
    };
    const openItem = (itemId: string) => router.push(`/home?item=${itemId}`);
    openNotificationTarget(openItem);
    const taps = listenForNotificationTaps(openItem);
    void Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => {
      sub.remove();
      taps();
    };
  }, []);

  if (ready && !user) return <Redirect href="/sign-in" />;

  return (
    <CaptureProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="review" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="admin" />
      </Stack>
      {banner ? (
        <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16 }}>
          <Pressable onPress={clearBanner}>
            <View style={{ padding: 12, borderRadius: 16, backgroundColor: 'rgba(225,91,115,0.92)' }}>
              <AppText color="#fff">{banner}</AppText>
            </View>
          </Pressable>
        </View>
      ) : null}
    </CaptureProvider>
  );
}

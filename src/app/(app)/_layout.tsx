import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { Platform } from 'react-native';

import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { armAutoRecord } from '@/lib/record-signal';
import { isRecordLink } from '../../../shared/parse/links';

export default function AppLayout() {
  const { ready, user } = useApp();
  const { locale } = useI18n();
  useQuickActionRouting((action) => {
    if (action.id === 'record') armAutoRecord();
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void QuickActions.setItems([
      {
        id: 'record',
        title: locale === 'tr' ? 'Kaydet' : 'Record',
        subtitle: 'Talktray ile kaydet',
        icon: Platform.OS === 'ios' ? 'symbol:mic.fill' : undefined,
        params: { href: '/record?autostart=1' },
      },
    ]).catch(() => undefined);
  }, [locale]);

  useEffect(() => {
    const open = (url: string | null) => {
      if (!isRecordLink(url)) return;
      armAutoRecord();
    };
    void Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, []);

  if (ready && !user) return <Redirect href="/sign-in" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="review" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

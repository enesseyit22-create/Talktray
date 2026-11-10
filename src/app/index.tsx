import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Aurora } from '@/components/Aurora';
import { useApp } from '@/data/AppProvider';
import { hasPendingRecord } from '@/lib/record-signal';
import { useTheme } from '@/theme/ThemeProvider';

export default function Index() {
  const { ready, user, onboardingDone } = useApp();
  const { colors } = useTheme();
  if (!ready) {
    return (
      <Aurora>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Aurora>
    );
  }
  if (!onboardingDone) return <Redirect href="/onboarding" />;
  if (!user) return <Redirect href="/sign-in" />;
  if (hasPendingRecord()) return <Redirect href="/record?autostart=1" />;
  return <Redirect href="/home" />;
}

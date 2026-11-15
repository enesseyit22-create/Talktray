import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Aurora } from '@/components/Aurora';
import { AppText, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { joinSharedList, sharedListError } from '@/services/shared-lists';
import { useTheme } from '@/theme/ThemeProvider';

/** talktray://join?code=ABCD2345 opens here and joins the shared list. */
export default function JoinRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const app = useApp();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const value = Array.isArray(code) ? code[0] ?? '' : code ?? '';

  useEffect(() => {
    if (started.current || app.mode !== 'supabase' || !app.user || !value) return;
    started.current = true;
    joinSharedList(value)
      .then((joined) => router.replace({ pathname: '/lists/[id]', params: { id: joined.id } }))
      .catch((caught) => {
        const kind = sharedListError(caught as { message?: string; code?: string });
        setError(t(kind === 'not_found' ? 'shared.errorNotFound' : kind === 'full' ? 'shared.errorFull' : 'shared.errorNetwork'));
      });
  }, [app.mode, app.user, t, value]);

  const blocked = app.mode !== 'supabase' || !value;
  return (
    <Aurora>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
        <AppText size={24} weight="extrabold">
          {t('shared.joinTitle')}
        </AppText>
        <AppText color={error || blocked ? colors.danger : colors.muted}>
          {error ?? (blocked ? t('shared.signInBody') : t('shared.joining'))}
        </AppText>
        {error || blocked ? <PrimaryButton label={t('shared.title')} onPress={() => router.replace('/lists')} /> : null}
      </View>
    </Aurora>
  );
}

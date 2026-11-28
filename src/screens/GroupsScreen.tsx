import { useCallback, useState } from 'react';
import { ScrollView, Share } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { AppText, EmptyState, Field, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { formatInviteCode, inviteLink, normalizeInviteCode } from '@/services/shared-lists';
import {
  createCircle,
  createCircleList,
  joinCircle,
  leaveCircle,
  loadCircles,
  type Circle,
} from '@/services/circles';

export function GroupsScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [groups, setGroups] = useState<Circle[] | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('👥');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    loadCircles().then(setGroups).catch(() => setGroups([]));
  }, []);
  useFocusEffect(reload);

  const share = (group: Circle) => {
    const pretty = formatInviteCode(group.inviteCode);
    void Share.share({ message: t('groups.invite', { name: group.name, code: pretty, link: inviteLink(group.inviteCode) }) });
  };

  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 8, gap: 12, paddingBottom: 40 }}>
        <PrimaryButton tone="glass" label={t('close')} onPress={() => router.back()} />
        <AppText size={32} weight="extrabold">{t('groups.title')}</AppText>
        <AppText>{t('groups.hint')}</AppText>
        {groups?.length === 0 ? <EmptyState title={t('groups.emptyTitle')} body={t('groups.emptyBody')} /> : null}
        {groups?.map((group) => (
          <GlassCard key={group.id} style={{ gap: 8 }}>
            <AppText weight="bold" size={18}>{`${group.emoji} ${group.name}`}</AppText>
            <AppText>{formatInviteCode(group.inviteCode)}</AppText>
            <PrimaryButton label={t('groups.share')} onPress={() => share(group)} />
            <PrimaryButton
              tone="glass"
              label={t('groups.addList')}
              onPress={() => void createCircleList(group.id, t('shared.defaultName')).then((list) => router.push({ pathname: '/lists/[id]', params: { id: list.id } }))}
            />
            <PrimaryButton tone="glass" label={group.ownerId === app.user?.id ? t('groups.delete') : t('groups.leave')} onPress={() => void leaveCircle(group.id).then(reload)} />
          </GlassCard>
        ))}
        <Field label={t('groups.name')} value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label={t('groups.emoji')} value={emoji} onChangeText={setEmoji} autoCapitalize="none" />
        <PrimaryButton
          label={t('groups.create')}
          onPress={() => {
            setError(null);
            void createCircle(name || t('groups.defaultName'), emoji)
              .then(() => {
                setName('');
                reload();
              })
              .catch(() => setError(t('shared.errorNetwork')));
          }}
        />
        <Field label={t('groups.code')} value={code} onChangeText={(value) => setCode(value.toUpperCase())} autoCapitalize="none" />
        <PrimaryButton
          tone="glass"
          label={t('groups.join')}
          disabled={normalizeInviteCode(code).length !== 8}
          onPress={() => {
            void joinCircle(code)
              .then(() => {
                setCode('');
                reload();
              })
              .catch(() => setError(t('shared.errorNotFound')));
          }}
        />
        {error ? <AppText>{error}</AppText> : null}
      </ScrollView>
    </Aurora>
  );
}

import { AppText, PrimaryButton, Sheet } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import type { VoiceAction } from '../../shared/parse/commands';
import { useI18n } from '@/i18n';
import { useState } from 'react';

export function CommandSheet() {
  const { t } = useI18n();
  const app = useApp();
  const actions = app.voiceActions;
  const [notice, setNotice] = useState<string | null>(null);
  if (!actions?.length) return null;
  const ambiguous = actions.filter((action) => action.kind === 'ambiguous');
  const ready = actions.filter((action) => action.kind !== 'ambiguous');

  const run = async (action: VoiceAction & { kind: 'delete' | 'reschedule' }) => {
    if (action.kind === 'delete') await app.deleteItem(action.itemId);
    else await app.updateItem(action.itemId, { dueAt: action.dueAt });
    setNotice(t('commands.done', { title: action.title }));
  };

  return (
    <Sheet visible onClose={app.clearVoiceActions}>
      <AppText size={22} weight="extrabold">
        {t('commands.title')}
      </AppText>
      <AppText>{ambiguous.length ? t('commands.ambiguous') : t('commands.ready')}</AppText>
      {ready.map((action) =>
        action.kind === 'delete' ? (
          <PrimaryButton key={action.itemId} label={t('commands.delete', { title: action.title })} onPress={() => void run(action)} />
        ) : (
          <PrimaryButton key={action.itemId} label={t('commands.move', { title: action.title })} onPress={() => void run(action)} />
        ),
      )}
      {ambiguous.map((action) =>
        action.matches.map((match) => (
          <PrimaryButton
            key={match.id}
            tone="glass"
            label={t(action.intent === 'delete' ? 'commands.delete' : 'commands.move', { title: match.title })}
            onPress={() =>
              void run(
                action.intent === 'delete'
                  ? { kind: 'delete', itemId: match.id, title: match.title }
                  : { kind: 'reschedule', itemId: match.id, title: match.title, dueAt: action.dueAt ?? new Date().toISOString() },
              )
            }
          />
        )),
      )}
      {notice ? <AppText>{notice}</AppText> : null}
      <PrimaryButton tone="glass" label={t('close')} onPress={app.clearVoiceActions} />
    </Sheet>
  );
}

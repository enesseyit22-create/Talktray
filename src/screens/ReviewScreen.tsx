import { useState } from 'react';
import { Platform, Pressable, ScrollView, StatusBar, View } from 'react-native';
import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { EditSheet } from '@/components/EditSheet';
import { TypeIcon } from '@/components/ItemCard';
import { AppText, Field, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import type { DraftItem } from '@/domain/types';
import { useI18n } from '@/i18n';
import { errorText } from '@/lib/errors';
import { sheetTopInset } from '@/lib/layout';
import { formatDueLabel } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

export function ReviewScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [editing, setEditing] = useState<DraftItem | null>(null);
  const [exportCalendar, setExportCalendar] = useState(app.profile.exportToCalendar);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const draft = app.draft;

  if (!draft) {
    return (
      <Aurora>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, paddingTop: sheetTopInset(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0, Platform.OS), paddingBottom: Math.max(insets.bottom, 16) }}>
          <EmptyBack />
        </View>
      </Aurora>
    );
  }

  return (
    <Aurora>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          padding: 20,
          paddingTop: sheetTopInset(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0, Platform.OS) + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: 12,
        }}
      >
        <View style={{ alignSelf: 'center', width: 48, height: 5, borderRadius: 99, backgroundColor: colors.soft }} />
        <AppText size={28} weight="extrabold">
          {t('review.title')}
        </AppText>
        {draft.mocked ? <AppText color={colors.primary}>{t('review.mocked')}</AppText> : null}
        <Field
          label={t('review.transcript')}
          value={draft.transcript}
          onChangeText={app.setDraftTranscript}
          multiline
          autoCapitalize="sentences"
        />
        <PrimaryButton tone="glass" label={t('review.reparse')} onPress={app.reparseDraft} />
        {draft.items.length === 0 ? <AppText color={colors.muted}>{t('review.empty')}</AppText> : null}
        {draft.items.map((item) => (
          <GlassCard key={item.localId} onPress={() => setEditing(item)}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <TypeIcon type={item.type} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="bold">
                  {t(`types.${item.type}`)}: {item.title}
                </AppText>
                {item.dueAt ? (
                  <AppText size={12} color={colors.muted}>
                    {formatDueLabel(
                      item.dueAt,
                      new Date(),
                      app.profile.timezone,
                      app.profile.locale,
                      t('today'),
                      t('tomorrow'),
                      item.allDay,
                    )}
                  </AppText>
                ) : null}
              </View>
              <Pressable hitSlop={10} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} onPress={() => app.removeDraftItem(item.localId)}>
                <Trash2 color={colors.danger} size={18} />
              </Pressable>
            </View>
          </GlassCard>
        ))}
        <PrimaryButton tone="glass" label={t('review.add')} onPress={app.addDraftItem} />
        <Pressable onPress={() => setExportCalendar((value) => !value)}>
          <GlassCard>
            <AppText weight="semibold" color={exportCalendar ? colors.primary : colors.text}>
              {exportCalendar ? '✓ ' : ''}
              {t('review.export')}
            </AppText>
          </GlassCard>
        </Pressable>
        <PrimaryButton
          label={t('review.save')}
          loading={saving}
          onPress={() => {
            setSaving(true);
            setSaveError(null);
            void app
              .saveDraft(exportCalendar)
              .then(() => router.replace('/'))
              .catch((caught) => setSaveError(errorText(caught, t('errors.generic'))))
              .finally(() => setSaving(false));
          }}
        />
        {saveError ? <AppText color={colors.danger}>{saveError}</AppText> : null}
        <PrimaryButton
          tone="glass"
          label={t('cancel')}
          onPress={() => {
            app.discardDraft();
            router.back();
          }}
        />
      </ScrollView>
      <EditSheet
        visible={Boolean(editing)}
        item={editing}
        timeZone={app.profile.timezone}
        defaultOffsets={app.profile.reminderOffsets}
        onClose={() => setEditing(null)}
        onChange={(patch) => {
          if (!editing) return;
          const next = { ...editing, ...patch };
          setEditing(next);
          app.updateDraftItem(editing.localId, patch);
        }}
        onDelete={() => {
          if (!editing) return;
          app.removeDraftItem(editing.localId);
          setEditing(null);
        }}
      />
    </Aurora>
  );
}

function EmptyBack() {
  const { t } = useI18n();
  return (
    <View style={{ gap: 12 }}>
      <AppText>{t('review.empty')}</AppText>
      <PrimaryButton label={t('close')} onPress={() => router.back()} />
    </View>
  );
}

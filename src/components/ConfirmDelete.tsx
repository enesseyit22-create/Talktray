import { AppText, PrimaryButton, Sheet } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

export function ConfirmDelete({
  visible,
  title,
  body,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onCancel}>
      <AppText size={20} weight="extrabold">
        {title}
      </AppText>
      <AppText color={colors.muted}>{body}</AppText>
      <PrimaryButton label={t('confirmDelete.confirm')} onPress={onConfirm} />
      <PrimaryButton tone="glass" label={t('cancel')} onPress={onCancel} />
    </Sheet>
  );
}

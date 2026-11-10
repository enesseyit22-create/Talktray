import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { Aurora } from '@/components/Aurora';
import { Logo } from '@/components/Brand';
import { AppText, Field, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

export function SignInScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { configured, signIn, signUp, signInApple, signInGoogle, enterDemo } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email.includes('@') || password.length < 6) {
      setError(t('auth.invalid'));
      return;
    }
    setLoading(true);
    try {
      if (mode === 'up') {
        const result = await signUp(email, password, name);
        if (result === 'confirm') {
          setInfo(t('auth.checkEmail'));
          setMode('in');
          return;
        }
      } else {
        await signIn(email, password);
      }
      router.replace('/home');
    } catch {
      setError(t('auth.failed'));
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (kind: 'apple' | 'google') => {
    setError(null);
    if (!configured) {
      setError(t('auth.oauthNeedsKeys'));
      return;
    }
    setLoading(true);
    try {
      if (kind === 'apple') await signInApple();
      else await signInGoogle();
      router.replace('/home');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setError(message === 'APPLE_IOS' ? t('auth.appleIos') : t('auth.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Aurora>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, gap: 18, paddingBottom: 40 }}>
          <Logo />
          <View style={{ gap: 6 }}>
            <AppText size={34} weight="extrabold">
              {mode === 'in' ? t('auth.welcome') : t('auth.create')}
            </AppText>
            <AppText color={colors.muted}>{t('auth.subtitle')}</AppText>
          </View>
          <GlassCard style={{ gap: 12 }}>
            {mode === 'up' ? (
              <Field label={t('name')} value={name} onChangeText={setName} placeholder={t('auth.namePlaceholder')} autoCapitalize="words" />
            ) : null}
            <Field label={t('email')} value={email} onChangeText={setEmail} placeholder="enes@talktray.app" />
            <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
            {error ? <AppText color={colors.danger}>{error}</AppText> : null}
            {info ? <AppText color={colors.success}>{info}</AppText> : null}
            <PrimaryButton label={mode === 'in' ? t('auth.signIn') : t('auth.signUp')} onPress={() => void submit()} loading={loading} />
            <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')}>
              <AppText weight="semibold" color={colors.primary} style={{ textAlign: 'center' }}>
                {mode === 'in' ? t('auth.switchSignUp') : t('auth.switchSignIn')}
              </AppText>
            </Pressable>
          </GlassCard>
          <PrimaryButton label={t('auth.apple')} tone="glass" onPress={() => void oauth('apple')} />
          <PrimaryButton label={t('auth.google')} tone="glass" onPress={() => void oauth('google')} />
          {!configured ? (
            <GlassCard style={{ gap: 10 }}>
              <AppText color={colors.muted}>{t('auth.demoHint')}</AppText>
              <PrimaryButton
                label={t('auth.demoCta')}
                onPress={() => {
                  void enterDemo(name || email.split('@')[0] || 'Enes', email).then(() => router.replace('/home'));
                }}
              />
            </GlassCard>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Aurora>
  );
}

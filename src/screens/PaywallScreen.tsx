import { Check, Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StatusBar, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { AppText, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { sheetTopInset } from '@/lib/layout';
import { loadStoreOffers, type StoreOffer } from '@/services/purchases';
import { fallbackOffers } from '@/services/billing-shared';
import { useTheme } from '@/theme/ThemeProvider';

export function PaywallScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [offers, setOffers] = useState<StoreOffer[]>(fallbackOffers);
  const [available, setAvailable] = useState(false);
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadStoreOffers().then((result) => {
      setOffers(result.offers);
      setAvailable(result.available);
    });
  }, []);

  const selected = offers.find((offer) => offer.id === plan) ?? offers[1] ?? offers[0];
  const buy = async () => {
    setLoading(true);
    setMessage(null);
    const result = await app.purchase(plan);
    setLoading(false);
    if (result === 'pro') {
      router.back();
      return;
    }
    if (result === 'cancelled') setMessage(t('paywall.cancelled'));
    else setMessage(t('paywall.unavailable'));
  };

  return (
    <Aurora>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 22,
          paddingTop: sheetTopInset(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0, Platform.OS) + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 28,
          gap: 14,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <AppText color={colors.muted}>{t('close')}</AppText>
        </Pressable>
        <View style={{ alignItems: 'center', alignSelf: 'stretch', gap: 8 }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: colors.glassStrong,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.glassBorder,
            }}
          >
            <Sparkles color={colors.primary} size={34} />
          </View>
          <AppText size={34} weight="extrabold" style={{ textAlign: 'center', alignSelf: 'stretch' }}>
            {t('paywall.title')}
          </AppText>
          <AppText color={colors.muted} style={{ textAlign: 'center', alignSelf: 'stretch' }}>
            {app.usage.isPro ? t('paywall.current') : t('paywall.subtitle')}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {offers.map((offer) => {
            const active = offer.id === plan;
            return (
              <Pressable key={offer.id} style={{ flex: 1, minWidth: 0 }} onPress={() => setPlan(offer.id)}>
                <GlassCard
                  style={{
                    gap: 6,
                    borderColor: active ? colors.primary : colors.glassBorder,
                    borderWidth: active ? 2 : 1,
                  }}
                >
                  {offer.id === 'yearly' ? (
                    <AppText size={12} weight="bold" color={colors.primary}>
                      {t('paywall.best')}
                    </AppText>
                  ) : (
                    <AppText size={12}> </AppText>
                  )}
                  <AppText weight="bold">{t(offer.id === 'yearly' ? 'paywall.yearly' : 'paywall.monthly')}</AppText>
                  <AppText size={26} weight="extrabold">
                    {offer.price}
                  </AppText>
                  <AppText size={12} color={colors.muted}>
                    {offer.id === 'yearly' ? t('paywall.billedYearly') : t('paywall.billedMonthly')}
                  </AppText>
                  {offer.id === 'yearly' && offer.perMonth ? (
                    <AppText size={12} color={colors.muted}>
                      {t('paywall.equiv', { price: offer.perMonth })}
                    </AppText>
                  ) : (
                    <AppText size={12}> </AppText>
                  )}
                </GlassCard>
              </Pressable>
            );
          })}
        </View>
        <GlassCard style={{ gap: 12 }}>
          {['f1', 'f2', 'f3', 'f4'].map((key) => (
            <View key={key} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Check color={colors.success} size={18} />
              <AppText style={{ flex: 1, minWidth: 0 }}>{t(`paywall.${key}`)}</AppText>
            </View>
          ))}
        </GlassCard>
        {message ? <AppText color={colors.primary}>{message}</AppText> : null}
        {!app.usage.isPro ? (
          <PrimaryButton label={`${t('paywall.cta')} · ${selected?.price ?? ''}`} onPress={() => void buy()} loading={loading} />
        ) : null}
        {!available && app.mode === 'demo' ? (
          <PrimaryButton
            tone="glass"
            label={t('paywall.demoPurchase')}
            onPress={() => void app.simulatePro().then(() => router.back())}
          />
        ) : null}
        <PrimaryButton
          tone="glass"
          label={t('restore')}
          onPress={() =>
            void app.restore().then((ok) => setMessage(ok ? t('paywall.restored') : t('paywall.unavailable')))
          }
        />
        <AppText size={12} color={colors.soft} style={{ textAlign: 'center' }}>
          {t('paywall.legal')}
        </AppText>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, flexWrap: 'wrap' }}>
          <Pressable onPress={() => void Linking.openURL(TERMS_URL)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText size={13} weight="semibold" color={colors.primary}>
              {t('paywall.terms')}
            </AppText>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText size={13} weight="semibold" color={colors.primary}>
              {t('paywall.privacy')}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </Aurora>
  );
}

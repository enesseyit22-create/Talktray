# Talktray

Talktray is a voice inbox. You tap once, speak a thought, and the app turns it into tasks, reminders, calendar events, shopping items, and notes. You review the result, then it lands in lists you can finish, edit, or delete.

The interface is a soft glass layout: pastel blobs, frosted cards, a raised record button, and a deep-indigo dark mode. Turkish and English ship together. The product is subscription-only. There are no ads.

Free accounts get **25 recordings per month**, enforced on the server. Pro is **$7.99/month** or **$49.99/year** (entitlement `pro`) with a **300 recording** fair-use cap.

## Run it here

```bash
npm install
npm run web
```

With the placeholders in `.env.example` (or no `.env` at all) the app opens in **demo mode**. Demo mode keeps data on the device, parses text on the device, and does not call Groq or RevenueCat. Try a sample thought in Turkish or English from the Record tab, edit the cards, and save them.

```bash
npm test          # parser tests, including Turkish relative dates
npm run typecheck
npm run lint
npx expo start    # Expo Go or a dev client
```

## What works without keys

- Onboarding, email sign-in UI, and a demo inbox
- Hold or tap to record (the transcript falls back to an editable sample when no speech key is set)
- Typed thoughts and one-tap Turkish / English samples
- Review, edit, delete, and confirm before save
- Today, reminders, calendar, shopping, tasks, and notes
- Mark done, local notification scheduling, and calendar export when the OS allows it
- Light and dark glass UI, Turkish and English
- Paywall layout. In demo mode, “Simulate Pro” unlocks the fair-use cap on this device

## What is mocked until you add keys

| Piece | Without keys | After setup |
| --- | --- | --- |
| Account | Demo user stored on the device | Supabase email, Apple, and Google |
| Speech to text | Editable sample transcript | Edge Function calls Groq Whisper (`whisper-large-v3`) or OpenAI |
| Parsing | On-device rules for Turkish and English | Same Edge Function calls an LLM with a strict JSON schema, then normalizes dates |
| Quota | Counted locally | `consume_recording_quota` in Postgres, service role only |
| Purchases | Simulated Pro in demo | RevenueCat entitlement `pro` |
| Widgets, Control Center, Siri, Quick Settings, icon shortcut | UI explains them | EAS dev build only. They are not in Expo Go |

Widgets do not record in the background. iOS and Android both open `talktray://record?autostart=1`, and the app starts listening.

## One-tap capture (dev build, not Expo Go)

These need a custom native binary. Expo Go does not include the widget extension, the Quick Settings tile, or `react-native-purchases`.

**iOS** (`targets/widget`, `@bacons/apple-targets`, deployment target 17):

- Home screen widget, small and medium, with a glass mic and today’s count
- Lock screen circular widget (`accessoryCircular`)
- Interactive App Intent that opens `talktray://record?autostart=1`
- iOS 18 Control Center control
- App Shortcut / Siri phrase **“Talktray ile kaydet”**, which can be assigned to the Action Button
- Home screen quick action “Kaydet”

**Android** (`modules/talktray-capture`):

- Small and medium home screen widgets
- Quick Settings tile
- Long-press app shortcut
- All three open the same record deep link

Today’s count is written to the iOS App Group `group.com.talktray.app` and to Android shared preferences whenever the inbox changes.

```bash
npx expo prebuild
npx expo run:ios      # or run:android
# or
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile development --platform android
```

`ios.appleTeamId` is `5B7448U5F6`, and `ios.usesAppleSignIn` is on so the `expo-apple-authentication` plugin can add Sign in with Apple.

## Over-the-air updates

JS and asset changes ship with EAS Update. The runtime version policy is `fingerprint`, so an update only installs on a binary with the same native fingerprint. `eas.json` maps builds to channels: `development`, `preview`, and `production`. The app does not download on cold start by itself (`checkAutomatically` is `NEVER`). It checks when the app launches and when it returns to the foreground, downloads in the background, then shows a glass prompt: **“Yeni sürüm hazır, yeniden başlat”** / “A new version is ready. Restart”. Profile has **Güncellemeleri denetle**, plus the app version and the running update id.

EAS is linked to the `fishmaps` project `02e5d8f6-f11d-421c-92c9-2d4f699eed65` (`expo.owner`, `extra.eas.projectId`, and `updates.url` in `app.json`).

```bash
npx eas-cli update --channel production --message "Copy and inbox fixes"
npx eas-cli update --channel preview --message "Preview"
npx eas-cli update --channel development --message "Dev client"
```

**New store build** (native fingerprint changes): Expo SDK or native module upgrades, `app.json` plugins, icons that are baked into the binary, widgets, Control Center, Siri shortcuts, Quick Settings, entitlements, permissions, and `expo-updates` itself.

**OTA is enough:** screens, copy, styles, the parser in `shared/parse`, and images imported from JavaScript.

Expo Go and `npm run web` do not apply these updates. The Profile row says so.

## Setup the owner still has to do

1. **Create a Supabase project.** In the SQL editor, run `supabase/migrations/20261110160000_init.sql`. It creates tables, RLS, the signup profile trigger (in the private schema), the quota functions (service role only), and the private `recordings` storage bucket.

2. **Auth providers.** Apple (`com.talktray.app`) and Google (web and iOS client IDs) are already enabled. Keep Email on, and keep the redirect `talktray://auth-callback`. Put the project URL and the publishable (or anon) key in `.env`:

   ```bash
   cp .env.example .env
   ```

   `EXPO_PUBLIC_SUPABASE_URL=https://ggcubezrrnplpdyfvzhe.supabase.co`  
   `EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY`

3. **Secrets for the Edge Function.** Never put these in the app.

   ```bash
   npx supabase secrets set \
     GROQ_API_KEY=YOUR_GROQ_KEY \
     STT_PROVIDER=groq \
     STT_MODEL=whisper-large-v3 \
     LLM_PROVIDER=groq \
     LLM_MODEL=openai/gpt-oss-120b \
     REVENUECAT_SECRET_API_KEY=YOUR_REVENUECAT_SECRET \
     REVENUECAT_ENTITLEMENT_ID=pro
   ```

   `llama-3.3-70b-versatile` is retired. The function uses `openai/gpt-oss-120b` and, if that call fails, `openai/gpt-oss-20b`.

   Optional OpenAI fallback: `OPENAI_API_KEY`, `OPENAI_STT_MODEL=whisper-1`, `OPENAI_LLM_MODEL=gpt-4o-mini`, and set `STT_PROVIDER=openai` or `LLM_PROVIDER=openai`.

   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform. The function also accepts the newer `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` JSON secrets.

4. **Deploy the function.**

   ```bash
   npx supabase functions deploy process-recording
   ```

   The client uploads audio to `recordings/{userId}/{recordingId}.m4a`, then calls this function. It checks the RevenueCat `pro` entitlement, reserves a monthly credit, transcribes, asks the model for JSON, and resolves leftover relative dates in the user’s timezone. Items are saved only after the person confirms them on the review sheet.

5. **RevenueCat.** The project is already wired. Entitlement `pro`. Offering `default` with packages `$rc_monthly` ($7.99/month) and `$rc_annual` ($49.99/year). Public SDK keys are the defaults in `.env.example`, `eas.json` build env, and `src/services/billing-shared.ts`: iOS `appl_RgzWQMZehRfiafWyReOAOBMlTgD`, Android `goog_PBSMDAoJJABsIyxqmhhcXSCorNT`. Put only the **secret** API key in the Supabase secret above. The app calls `Purchases.logIn` with the Supabase user id.

6. **Store setup.** Create the same product IDs in the stores and attach them in RevenueCat, or purchases stay empty. App Store Connect auto-renewable subscriptions: `talktray_pro_monthly` ($7.99/month) and `talktray_pro_annual` ($49.99/year). Google Play subscription id `talktray_pro` with base plans `monthly` and `annual`. A Play service account is still required before real charges work. Demo mode can still simulate Pro.

7. **EAS.** `eas.json` has `development`, `preview`, and `production` profiles. Development builds include the dev client plus widgets. Set the Apple team id, then:

   ```bash
   npx eas-cli build --profile development --platform all
   ```

8. **EAS Update.** `app.json` already has the `fishmaps` owner and project id `02e5d8f6-f11d-421c-92c9-2d4f699eed65`. Publish JS changes with `npx eas-cli update --channel production`. See “Over-the-air updates” above for what still needs a store build.

## Project map

- `src/app` — Expo Router screens
- `src/screens` — glass UI
- `shared/parse` — date resolution, extraction, quota, and the LLM prompt. This is what the unit tests cover
- `supabase/functions/_shared/parse` — the same parser, with explicit `.ts` imports, so `supabase functions deploy` can bundle it
- `supabase/functions/process-recording` — speech and model calls
- `supabase/migrations` — schema and RLS
- `targets/widget` — iOS WidgetKit, Control Center, and the Siri shortcut
- `modules/talktray-capture` — Android widget, Quick Settings tile, and icon shortcut

The mark in `assets/images/icon.png` is the full-bleed app icon. Android uses the waveform as a transparent foreground over the mint-to-lavender gradient, and notifications use the white silhouette in `assets/images/notification-icon.png`.

## Kendi bilgisayarında kurulum

```bash
git clone https://github.com/enesseyit22-create/talktray.git
cd talktray
npm install
cp .env.example .env
```

`.env` içine Supabase ve RevenueCat genel anahtarlarını yaz. Sonra:

```bash
npx eas-cli login
npx eas-cli update --channel production --message "İlk yayın"
```

Aynı işi GitHub’dan yapmak için depo sırlarına şunları ekle (Settings → Secrets and variables → Actions):

- `EXPO_TOKEN` — expo.dev hesap ayarlarındaki erişim anahtarı
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` ve `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` isteğe bağlıdır. Sırlar boşsa `.env.example` içindeki genel istemci kimlikleri kullanılır.

`main` dalına her push, production kanalına bir OTA güncellemesi gönderir. El ile çalıştırmak için Actions → EAS Update → Run workflow (kanal: production veya preview). Mağaza derlemesi için Actions → EAS Build.

## Languages

The app ships in English, Turkish, Spanish, Brazilian Portuguese, German, French, Italian, Japanese, Korean, and Indonesian. Copy is in `src/i18n/`. The device locale comes from `expo-localization`; any `pt-*` tag maps to `pt-BR`, and anything else unknown falls back to English. Native permission strings live in `locales/`. Store listing copy is in `store/listings/`. Add a locale by translating `en.ts`, registering it, listing it in `expo.locales` and `supportedLocales`, and allowing the code in the `profiles.locale` check.

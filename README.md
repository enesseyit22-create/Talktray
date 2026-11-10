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

Set `ios.appleTeamId` in `app.json` before an iOS build. Find it in Xcode under Signing & Capabilities, or in your Apple Developer account.

## Setup the owner still has to do

1. **Create a Supabase project.** In the SQL editor, run `supabase/migrations/20261110160000_init.sql`. It creates tables, RLS, the signup profile trigger (in the private schema), the quota functions (service role only), and the private `recordings` storage bucket.

2. **Auth providers.** Enable Email. Enable Apple and Google, and add the redirect `talktray://auth-callback`. Put the project URL and the publishable (or anon) key in `.env`:

   ```bash
   cp .env.example .env
   ```

   `EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co`  
   `EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY`

3. **Secrets for the Edge Function.** Never put these in the app.

   ```bash
   npx supabase secrets set \
     GROQ_API_KEY=YOUR_GROQ_KEY \
     STT_PROVIDER=groq \
     STT_MODEL=whisper-large-v3 \
     LLM_PROVIDER=groq \
     LLM_MODEL=llama-3.3-70b-versatile \
     REVENUECAT_SECRET_API_KEY=YOUR_REVENUECAT_SECRET \
     REVENUECAT_ENTITLEMENT_ID=pro
   ```

   Optional OpenAI fallback: `OPENAI_API_KEY`, `OPENAI_STT_MODEL=whisper-1`, `OPENAI_LLM_MODEL=gpt-4o-mini`, and set `STT_PROVIDER=openai` or `LLM_PROVIDER=openai`.

   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform. The function also accepts the newer `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` JSON secrets.

4. **Deploy the function.**

   ```bash
   npx supabase functions deploy process-recording
   ```

   The client uploads audio to `recordings/{userId}/{recordingId}.m4a`, then calls this function. It checks the RevenueCat `pro` entitlement, reserves a monthly credit, transcribes, asks the model for JSON, and resolves leftover relative dates in the user’s timezone. Items are saved only after the person confirms them on the review sheet.

5. **RevenueCat.** Create a project with an entitlement named `pro`. Add products for **$7.99/month** and **$49.99/year**, put both in the current offering, and attach them to `pro`. Copy the public SDK keys (`appl_…` and `goog_…`) into `.env`. Put the secret API key in the Supabase secret above. The app calls `Purchases.logIn` with the Supabase user id, so the Edge Function can look up the same subscriber.

6. **Store setup.** App Store Connect in-app purchases and a Google Play service account are required before real charges work. Until then, purchases throw and the paywall explains that. Demo mode can still simulate Pro.

7. **EAS.** `eas.json` has `development`, `preview`, and `production` profiles. Development builds include the dev client plus widgets. Set the Apple team id, then:

   ```bash
   npx eas-cli build --profile development --platform all
   ```

## Project map

- `src/app` — Expo Router screens
- `src/screens` — glass UI
- `shared/parse` — date resolution, extraction, quota, and the LLM prompt. This is what the unit tests cover
- `supabase/functions/process-recording` — speech and model calls
- `supabase/migrations` — schema and RLS
- `targets/widget` — iOS WidgetKit, Control Center, and the Siri shortcut
- `modules/talktray-capture` — Android widget, Quick Settings tile, and icon shortcut

The mark in `assets/images/icon.png` is the full-bleed app icon. Android uses the waveform as a transparent foreground over the mint-to-lavender gradient, and notifications use the white silhouette in `assets/images/notification-icon.png`.

Copy is in `src/i18n/en.ts` and `src/i18n/tr.ts`. Add a locale by translating `en.ts`, registering it in `src/i18n/index.tsx`, and allowing the code in the `profiles.locale` check constraint.

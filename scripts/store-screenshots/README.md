# Store screenshots

Builds App Store and Google Play images for every app language from the web preview.

```bash
EXPO_PUBLIC_PREVIEW=1 npx expo start --web --port 8081   # preview data, no account needed
node scripts/store-screenshots/capture.cjs                # raw screens → store/screenshots/raw
node scripts/store-screenshots/compose.cjs                # framed images → store/screenshots/final
```

Pass locales after the directories to do only some, e.g. `capture.cjs store/screenshots/raw tr en`.
Start the server without `CI=1` while editing, or restart it after code changes: with `CI=1` Metro does not watch files.

| Folder | Size | Store slot |
| --- | --- | --- |
| `ios-6.9` | 1290×2796 | App Store iPhone 6.9" (Apple scales it for smaller iPhones) |
| `ipad-13` | 2064×2752 | App Store iPad 13" (required: the app supports iPad) |
| `android-phone` | 1080×1920 | Google Play phone |
| `android-feature.jpg` | 1024×500 | Google Play feature graphic |

Sample content is in `src/data/seed-copy.ts`, headlines in `captions.json`. Japanese and Korean
need Noto CJK fonts installed (`apt-get install fonts-noto-cjk`).

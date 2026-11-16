# Promo video

A 35-second vertical (1080×1920, 30 fps) product film rendered from an HTML scene.
Every frame is drawn deterministically from a time value, so it is reproducible.

```bash
EXPO_PUBLIC_PREVIEW=1 EXPO_PUBLIC_PREVIEW_LOCALE=tr npx expo start --web --port 8081
node scripts/store-screenshots/capture.cjs store/screenshots/raw tr   # raw phone screens
node scripts/promo-video/render.js                                   # frames/NNNNN.jpg
ffmpeg -framerate 30 -i scripts/promo-video/frames/%05d.jpg -i music.wav \
  -c:v libx264 -crf 19 -pix_fmt yuv420p -c:a aac -shortest store/video/TalkTray-tanitim-9x16.mp4
```

`node render.js 1.6,5.5,10.5` renders single preview frames at those seconds.
Scenes and copy live in `scene.html` (SCENES timeline and the *Scene functions). The soundtrack
was generated with numpy (pad chords, soft pulse, whooshes at cuts); any royalty-free track works.

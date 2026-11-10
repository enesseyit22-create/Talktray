const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

/** Adds the long-press shortcut that deep-links into recording. */
function withTalktrayShortcuts(config) {
  return withAndroidManifest(config, (config) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    activity['meta-data'] = activity['meta-data'] ?? [];
    const name = 'android.app.shortcuts';
    const exists = activity['meta-data'].some((item) => item.$['android:name'] === name);
    if (!exists) {
      activity['meta-data'].push({
        $: {
          'android:name': name,
          'android:resource': '@xml/talktray_shortcuts',
        },
      });
    }
    return config;
  });
}

module.exports = withTalktrayShortcuts;

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'TalktrayWidget',
  displayName: 'Talktray',
  deploymentTarget: '17.0',
  bundleIdentifier: '.widget',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  colors: {
    $accent: { color: '#7A6AF0', darkColor: '#C4B5FD' },
    $widgetBackground: { color: '#F6F1FF', darkColor: '#100E22' },
  },
  images: {
    TalktrayMark: '../../assets/images/widget-mark.png',
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios?.entitlements?.['com.apple.security.application-groups'] ?? ['group.com.talktray.app'],
  },
});

// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Edge functions run on Deno (npm: imports) and scripts/ on Node; the Expo config does not fit them.
    ignores: ["dist/*", "supabase/functions/**", "scripts/**"],
  }
]);

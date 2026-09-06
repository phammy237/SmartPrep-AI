// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  // supabase/functions/** is Deno (own runtime/types) - not linted with the RN config.
  ignorePatterns: ['/dist/*', 'supabase/functions/**'],
  overrides: [
    {
      // Plain Node.js CLI scripts (not app code) - needs Node globals, not React Native's.
      files: ['scripts/**/*.js'],
      env: { node: true },
    },
  ],
};

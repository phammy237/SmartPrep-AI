// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*'],
  overrides: [
    {
      // Plain Node.js CLI scripts (not app code) - needs Node globals, not React Native's.
      files: ['scripts/**/*.js'],
      env: { node: true },
    },
  ],
};

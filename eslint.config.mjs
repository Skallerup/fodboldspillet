export default [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module',
  globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', performance: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
    fetch: 'readonly', console: 'readonly', structuredClone: 'readonly', speechSynthesis: 'readonly', SpeechSynthesisUtterance: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': 'warn' } }];

// ESLint: the recommended rules, the Vue rules for the client components,
// and limits for the complexity of a function. The Vue set is `essential`:
// only rules that find errors, no layout rules.
import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/.spectrail/**', '.example-build/**'] },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: {
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 4],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Browser code of the plugins.
    files: ['packages/*/src/client/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
];

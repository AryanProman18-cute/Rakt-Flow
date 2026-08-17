import js from '@eslint/js';

const browserGlobals = Object.fromEntries([
  'AbortController', 'Blob', 'BroadcastChannel', 'Event', 'File', 'FormData', 'HTMLElement',
  'IDBKeyRange', 'NodeFilter', 'Notification', 'Request', 'Response', 'URL', 'URLSearchParams',
  'atob', 'btoa', 'clearInterval', 'clearTimeout', 'console', 'crypto', 'document', 'fetch',
  'history', 'indexedDB', 'localStorage', 'location', 'matchMedia', 'navigator', 'queueMicrotask',
  'self', 'setInterval', 'setTimeout', 'window'
].map(name => [name, 'readonly']));

export default [
  { ignores: ['dist/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }]
    }
  }
];

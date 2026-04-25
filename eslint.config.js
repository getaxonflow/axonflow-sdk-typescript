const typescript = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.js', 'scripts/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        // Required by the type-aware @typescript-eslint rules
        // below (prefer-nullish-coalescing). Without project info,
        // the rule falls back to a syntactic heuristic that misses
        // common wire-field falsey-clobber patterns.
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      // Falsey-clobber prevention. The wire-shape audit caught
      // `data.foo || fallback` patterns that silently replaced
      // legitimate empty/false/0/[] wire values with the fallback
      // (e.g. generate_plan dropping result=0/false/[]/{}). Use `??`
      // (nullish coalescing) instead — it only falls through on
      // null/undefined, not on every falsy value. Auto-fixable via
      // `eslint --fix`.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        {
          ignoreConditionalTests: true,
          ignoreMixedLogicalExpressions: false,
        },
      ],
    },
  },
];

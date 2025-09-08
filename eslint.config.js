import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  // Base JavaScript rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Source files configuration
  {
    files: ['src/**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },

    // Plugins
    plugins: {
      import: importPlugin,
    },

    // Rules
    rules: {
      // TypeScript-specific rules - temporarily relaxed for initial commit
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/prefer-promise-reject-errors': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',

      // Import rules for better organization
      'import/order': [
        'error',
        {
          groups: [
            'builtin', // Node.js built-ins
            'external', // External packages
            'internal', // Internal modules
            'parent', // Parent directory imports
            'sibling', // Sibling directory imports
            'index', // Index imports
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-unresolved': 'off', // TypeScript handles this
      'import/no-duplicates': 'error',
      'import/no-unused-modules': 'off', // Can be performance heavy

      // General rules - temporarily relaxed
      'no-console': 'off',
      'no-debugger': 'error',
      'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
      'prefer-const': 'warn',
      'no-var': 'warn',
      'object-shorthand': 'warn',
      'prefer-template': 'warn',
      'prefer-arrow-callback': 'warn',
      'arrow-body-style': 'off', // Temporarily disabled
      'no-case-declarations': 'warn',

      // Code quality - temporarily relaxed
      complexity: ['warn', 25],
      'max-depth': ['warn', 8],
      'max-lines-per-function': ['warn', 150],
      'max-params': ['warn', 8],
    },
  },

  // Test files configuration
  {
    files: ['test/**/*.{js,mjs,cjs,ts}', 'src/**/*.{test,spec}.{js,mjs,cjs,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Relaxed rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'no-console': 'off',
      'max-lines-per-function': 'off',
      complexity: 'off',
    },
  },

  // E2E files configuration
  {
    files: ['e2e/**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.e2e.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Relaxed rules for e2e files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'no-console': 'off',
      'max-lines-per-function': 'off',
      complexity: 'off',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      '.yarn/**/*',
      '*.config.js',
      '*.config.ts',
      'coverage/**/*',
      '.git/**/*',
    ],
  },

  // Special configuration for config files
  {
    files: ['*.config.{js,ts,mjs}', 'eslint.config.js'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      'no-console': 'off',
    },
  }
);

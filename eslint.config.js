import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Shared React configuration
const reactConfig = {
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
    globals: {
      ...globals.browser,
      ...globals.node,
      ...globals.es2021,
    },
  },
  plugins: {
    react,
    'react-hooks': reactHooks,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    ...react.configs.recommended.rules,
    'react/react-in-jsx-scope': 'off',
    ...reactHooks.configs.recommended.rules,
    'react-hooks/static-components': 'off',
    // Disable set-state-in-effect as it's too strict for legitimate use cases
    'react-hooks/set-state-in-effect': 'off',
    // React 18 is not compiled with the React Compiler. These rules reject
    // intentional ref-backed event handlers and time-based UI calculations.
    'react-hooks/refs': 'off',
    'react-hooks/purity': 'off',
    'react-hooks/immutability': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
  },
};

export default [
  // Globally ignored files and directories
  {
    ignores: [
      // Dependencies
      'node_modules/**',
      'package/@stackframe/**',
      // The restored mcode package is validated by its Bun runtime smoke test;
      // it is not part of the root ESLint project and exceeds the root parser
      // heap when traversed together with the desktop app.
      'packages/mcode/**',
      // Build outputs
      'dist/**',
      'dist-web/**',
      'dist-electron/**',
      '**/dist/**',
      'build/**',
      'release/**',
      // Cache
      '.cache/**',
      '.vite/**',
      // Config files
      'vite.config.ts',
      'vite.config.*.ts',
      '**/vite.config.ts',
      'vitest.config.ts',
      '**/vitest.config.ts',
      'tailwind.config.js',
      '**/tailwind.config.js',
      'postcss.config.cjs',
      '**/postcss.config.cjs',
      // Generated files
      '**/*.d.ts',
      '**/*.map',
      // Python files
      '**/*.py',
      '__pycache__/**',
      '**/.venv/**',
      // Prebuilt resources
      'resources/prebuilt/**',
      // Archive (pre-refactor snapshots)
      'archive/**',
    ],
  },

  // Configuration for JavaScript files
  {
    files: ['**/*.js'],
    ...js.configs.recommended,
  },
  // Configuration for JSX files
  {
    files: ['**/*.jsx'],
    ...js.configs.recommended,
    ...reactConfig,
    rules: {
      ...js.configs.recommended.rules,
      ...reactConfig.rules,
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  // Configuration for Storybook files (simple config, no project)
  {
    files: ['.storybook/**/*.{ts,tsx}'],
    ...reactConfig,
    languageOptions: {
      ...reactConfig.languageOptions,
      parser: typescriptParser,
    },
    rules: {
      ...reactConfig.rules,
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  // Configuration for all TypeScript files (with project)
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['.storybook/**'],
    ...reactConfig,
    languageOptions: {
      ...reactConfig.languageOptions,
      parser: typescriptParser,
      parserOptions: {
        ...reactConfig.languageOptions.parserOptions,
        projectService: true,
      },
    },
    plugins: {
      ...reactConfig.plugins,
      '@typescript-eslint': typescript,
    },
    rules: {
      ...reactConfig.rules,
      // Disable prop-types for TypeScript files as TypeScript handles type checking
      'react/prop-types': 'off',
      // Disable base rule as it conflicts with TypeScript version
      'no-unused-vars': 'off',
      // Disable no-undef for TypeScript files as TypeScript handles this
      'no-undef': 'off',
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Guardrail: in src code, always use Host abstraction instead of direct window Electron APIs
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'electronAPI',
          message:
            'Use Host abstraction (useHost/createHost) instead of window.electronAPI',
        },
        {
          object: 'window',
          property: 'ipcRenderer',
          message:
            'Use Host abstraction (useHost/createHost) instead of window.ipcRenderer',
        },
      ],
    },
  },
  // Single allowed bridge for reading global Electron APIs
  {
    files: ['src/host/createHost.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  // Prettier config (must be last to override conflicting rules)
  prettier,
];

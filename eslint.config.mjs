import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Query keys come from the queryKeys factories so every key stays workspace scoped.
const webQueryKeySyntax = [
  {
    selector:
      "Property[key.name='queryKey'] > ArrayExpression, Property[key.name='queryKey'] > ConditionalExpression > ArrayExpression",
    message: "Build query keys with queryKeys.* from lib/queryKeys, not an array literal.",
  },
];

// Private data goes through the lib/api helpers, which attach the bearer token and handle refresh.
const webFetchSyntax = [
  {
    selector:
      "CallExpression[callee.name='fetch'], CallExpression[callee.object.name=/^(window|globalThis|self)$/][callee.property.name='fetch']",
    message: "Call the server through a lib/api helper, not fetch.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/.wrangler/**",
      "**/.astro/**",
      ".lighthouseci/**",
      "tmp/**",
      "apps/stt-bridge/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      // A leading underscore marks an intentionally unused argument, variable, or caught error.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Stream and transport teardown paths swallow expected errors on purpose.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["e2e/**/*.ts", "playwright.config.ts", "playwright.preview.config.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.e2e.json",
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // drizzle-kit loads this file from the repo root (drizzle.config.ts), where the root
    // package.json resolves no workspace packages. Keep it self-contained: drizzle-orm only.
    files: ["db/schema.ts", "db/schema-providers.ts", "db/schema-goals.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@zoption/*"],
              message:
                "db/schema.ts must stay self-contained: drizzle-kit reads it from the repo root, where @zoption/* does not resolve. Inline the value here instead of importing from a workspace package.",
            },
          ],
        },
      ],
    },
  },
  // Layering guardrails. Flat config replaces rather than merges a rule an earlier block set, so
  // every file gets its no-restricted-syntax from exactly one of the two web blocks below.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...webQueryKeySyntax, ...webFetchSyntax],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)lib/api/",
              message:
                "Import from lib/api, not its internals. Tests vi.mock the lib/api barrel, so a direct internal import silently escapes the mock.",
            },
          ],
        },
      ],
    },
  },
  {
    // The API client and the public Android release lookup are the only places that call fetch.
    files: [
      "apps/web/src/lib/api.ts",
      "apps/web/src/lib/api/**/*.ts",
      "apps/web/src/releases/useAndroidRelease.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...webQueryKeySyntax],
    },
  },
  {
    files: ["apps/mobile/src/features/**/*.{ts,tsx}", "apps/mobile/app/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^expo-sqlite",
              message:
                "Screens read through useLocalWorkspace hooks and write through the transaction mutation facade, never SQLite directly.",
            },
            {
              regex: "^@/db/(transaction-mutations|local-workspace)/",
              message:
                "Import the facade (@/db/transaction-mutation-repository or @/db/local-workspace-state), not its internals.",
            },
          ],
        },
      ],
    },
  },
  {
    // Routes receive repositories through their createXRoutes factory. These three still import a
    // repository singleton and are the only exceptions.
    files: ["apps/api/src/routes/**/*.ts"],
    ignores: [
      "apps/api/src/routes/admin-provider-configs.ts",
      "apps/api/src/routes/provider-credentials.ts",
      "apps/api/src/routes/voice-stream.ts",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(\\.\\./)+db/",
              allowTypeImports: true,
              message:
                "Pass the repository into createXRoutes from src/app.ts instead of importing it.",
            },
          ],
        },
      ],
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: [
      "**/scripts/**/*.mjs",
      "**/scripts/**/*.d.mts",
      "apps/mobile/*.cjs",
      "apps/mobile/__mocks__/**/*.js",
      "apps/mobile/plugins/**/*.js",
      "apps/web/public/**/*.js",
      "apps/site/public/**/*.js",
      "apps/web/src/lib/pcm-worklet.js",
      "eslint.config.mjs",
      "release.config.mjs",
    ],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        AbortSignal: "readonly",
        AudioWorkletProcessor: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        registerProcessor: "readonly",
        Response: "readonly",
        document: "readonly",
        localStorage: "readonly",
        matchMedia: "readonly",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["apps/mobile/__mocks__/**/*.js", "apps/mobile/plugins/**/*.test.js"],
    languageOptions: {
      globals: {
        afterEach: "readonly",
        beforeEach: "readonly",
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
        jest: "readonly",
        test: "readonly",
      },
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "apps/api/tests/**/*.ts",
      "apps/api/src/spike/**/*.ts",
    ],
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "no-empty": "off",
    },
  },
);

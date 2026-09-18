import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/.wrangler/**",
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
    files: ["e2e/**/*.ts", "playwright.config.ts"],
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
    files: ["db/schema.ts"],
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
  {
    ...tseslint.configs.disableTypeChecked,
    files: [
      "**/scripts/**/*.mjs",
      "**/scripts/**/*.d.mts",
      "apps/mobile/*.cjs",
      "apps/mobile/plugins/**/*.js",
      "apps/web/public/**/*.js",
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
    files: ["apps/mobile/plugins/**/*.test.js"],
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

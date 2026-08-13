import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/.wrangler/**", ".lighthouseci/**", "tmp/**"],
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
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
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
    ...tseslint.configs.disableTypeChecked,
    files: ["**/scripts/**/*.mjs", "apps/mobile/*.cjs", "apps/web/public/**/*.js"],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        AbortSignal: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
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
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
);

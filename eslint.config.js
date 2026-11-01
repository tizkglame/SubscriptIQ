import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dist-pages", "docs/assets", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          // Shared UI modules intentionally export their styling and context helpers.
          allowExportNames: [
            "usePaged",
            "METHODS",
            "badgeVariants",
            "buttonVariants",
            "useFormField",
            "navigationMenuTriggerStyle",
            "useSidebar",
            "toggleVariants",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  // Generated integration sources retain the upstream generator's formatting.
  {
    files: ["src/routeTree.gen.ts"],
    rules: { "prettier/prettier": "off" },
  },
  // TanStack's router plugin handles HMR for file routes, which export Route metadata.
  { files: ["src/routes/**/*.tsx"], rules: { "react-refresh/only-export-components": "off" } },
);

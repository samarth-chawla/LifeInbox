import js from "@eslint/js";
import next from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import typescript from "typescript-eslint";

export default defineConfig([
  globalIgnores([".next/**", "out/**", "coverage/**", "next-env.d.ts"]),
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [typescript.configs.recommended, next.configs["core-web-vitals"]],
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: { globals: { AbortSignal: "readonly", fetch: "readonly" } },
  },
]);

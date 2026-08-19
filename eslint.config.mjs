import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Proyek terpisah (Cloudflare Worker), di-lint sendiri di worker/.
    "worker/**",
  ]),
  {
    rules: {
      // Data fetching pada mount adalah pola umum di dashboard ini.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;

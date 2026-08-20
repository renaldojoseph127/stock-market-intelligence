import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
  globalIgnores([".next/**", "node_modules/**", "work/**", "devvit/**/dist/**", "devvit/**/node_modules/**", "next-env.d.ts"]),
]);
export default config;

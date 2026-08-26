import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";

// Downgrade every rule to "warn" — this is a metric, never a merge gate.
const sonarjsWarnRules = Object.fromEntries(
  Object.entries(sonarjs.configs.recommended.rules).map(([ruleId, severity]) => [
    ruleId,
    severity === "error" ? "warn" : severity,
  ]),
);

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      // Registered but not enabled, so ESLint can resolve pre-existing
      // `@typescript-eslint/*` eslint-disable comments in src/ instead of
      // erroring on an unresolved rule.
      "@typescript-eslint": tsPlugin,
      sonarjs,
    },
    rules: sonarjsWarnRules,
  },
];

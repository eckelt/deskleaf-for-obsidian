import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";

// AC2: sonarjs's recommended preset marks many rules "error" — this baseline
// is a metric, never a merge gate, so every rule is downgraded to "warn".
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
      // Registered (but not enabled) so ESLint can resolve the pre-existing
      // `@typescript-eslint/*` eslint-disable comments in src/ — otherwise it
      // reports an unrelated "rule not found" error, breaking the exit-0
      // guarantee this baseline depends on (AC3).
      "@typescript-eslint": tsPlugin,
      sonarjs,
    },
    rules: sonarjsWarnRules,
  },
];

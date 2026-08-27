// Code-quality baseline (issue #71): sonarjs code-smell metric only, no
// break threshold — mirrors stryker.config.mjs's `thresholds.break: null`.
// All sonarjs rules are forced to "warn" so `eslint` always exits 0
// regardless of finding count; see reports/quality/ workflow.
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";

const sonarjsWarnRules = Object.fromEntries(
  Object.entries(sonarjs.configs.recommended.rules).map(([ruleId, severity]) => [
    ruleId,
    severity === "off" ? "off" : "warn",
  ]),
);

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      sonarjs,
      // Registered (but not enabled) so that pre-existing
      // `eslint-disable-next-line @typescript-eslint/...` comments in src/
      // resolve to a known rule instead of failing as "rule not found".
      "@typescript-eslint": tsPlugin,
    },
    rules: sonarjsWarnRules,
  },
];

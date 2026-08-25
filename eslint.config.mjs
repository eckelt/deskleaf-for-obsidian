// Nightly code-quality baseline (issue #71): eslint-plugin-sonarjs against
// src/**/*.ts, reporting-only. Every sonarjs rule that the plugin's
// recommended config enables is downgraded from "error" to "warn" — there is
// no `break` threshold here, mirroring stryker.config.mjs's
// `thresholds.break: null` for the mutation-testing baseline. `eslint`
// therefore exits 0 regardless of how many findings are reported.
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import sonarjs from "eslint-plugin-sonarjs";

const sonarjsRules = Object.fromEntries(
  Object.entries(sonarjs.configs.recommended.rules).map(([ruleId, severity]) => [
    ruleId,
    severity === "off" ? "off" : "warn",
  ]),
);

export default [
  {
    files: ["src/**/*.ts"],
    // "@typescript-eslint" is registered (but no rules from it are enabled)
    // solely so pre-existing `// eslint-disable-next-line
    // @typescript-eslint/<rule>` comments in src/ resolve to a known rule —
    // otherwise ESLint's flat config treats a disable comment for an
    // unregistered rule as a hard error.
    plugins: { sonarjs, "@typescript-eslint": tsEslintPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sonarjsRules,
  },
];

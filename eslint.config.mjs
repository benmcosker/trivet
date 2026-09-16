import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Leading underscore marks a parameter that exists to shape a type
      // (mock signatures, callback arity) rather than to be used.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design handoffs are artefacts to implement against, not source to hold
    // to this project's rules. The first such folder was HTML and Markdown so
    // it never reached ESLint; this one ships the canvas runtime as `.js`,
    // which does - and lands five findings about somebody else's bundle.
    // Mirrors the entry in `.prettierignore`, for the same reason.
    "design_handoff_*/**",
  ]),
]);

export default eslintConfig;

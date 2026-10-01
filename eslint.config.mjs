import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    ignores: [
      "app/lib/queryKeys.ts",
      "app/lib/urlKeys.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: 'Property[key.name="queryKey"] > ArrayExpression',
          message:
            "Do not write queryKey arrays inline. Use the factory in app/lib/queryKeys.ts (e.g. keys.batch.students(batchId)). An inline key can silently omit a variable the fetch depends on, which reintroduces the stale-response bug.",
        },
        {
          selector: 'Property[key.name="mutationKey"] > ArrayExpression',
          message:
            "Do not write mutationKey arrays inline. Use the factory in app/lib/queryKeys.ts.",
        },
        {
          selector:
            'CallExpression[callee.name="useQueryState"][arguments.0.type="Literal"]',
          message:
            "Do not name a URL param inline. Use the schema in app/lib/urlKeys.ts — useQueryStates(urlKeys.<route>, URL_OPTIONS). An inline name skips the parser and default, so a typo silently reads as empty forever.",
        },
        {
          selector:
            'CallExpression[callee.name="useQueryStates"][arguments.0.type="ObjectExpression"]',
          message:
            "Do not declare URL params inline. Add them to app/lib/urlKeys.ts and pass the group — useQueryStates(urlKeys.<route>, URL_OPTIONS). Two screens declaring the same param separately is how they end up disagreeing about what it means.",
        },
        {
          selector: 'CallExpression[callee.name="useSearchParams"]',
          message:
            "Read URL state through nuqs, not useSearchParams — useQueryStates(urlKeys.<route>, URL_OPTIONS). Raw reads have no parser, no default, and no batching, so two writes in one tick silently overwrite each other. Remaining call sites are Section B migration targets.",
        },
        {
          selector:
            'NewExpression[callee.name="URLSearchParams"][arguments.0.property.name="search"]',
          message:
            "Do not read window.location.search directly. Use useQueryStates(urlKeys.<route>, URL_OPTIONS). Building a query string for a backend request with `new URLSearchParams()` is fine — this rule only fires on reading the browser URL.",
        },
        {
          selector:
            'CallExpression[callee.property.name="get"][arguments.0.value=/^(batch_id|student_id)$/]',
          message:
            "batch_id and student_id are retired URL params — use batchId and studentId (see LEGACY_PARAMS in app/lib/urlKeys.ts). Sending snake_case to the backend API is unaffected; this fires only on reading them back out of a URL.",
        },
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
  ]),
]);

export default eslintConfig;

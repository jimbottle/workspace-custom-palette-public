/**
 * ESLint flat config (eslint 9+). This is Tier 2 — run before a PR via
 * `npm run lint`, deliberately NOT in the pre-commit hook (CLAUDE.md: the hook
 * stays fast and runs typecheck + unit tests only).
 *
 * Scope: JavaScript only. `monitor/` is TypeScript and is checked by
 * `npm run typecheck:monitor` (its own tsconfig), which Tier 2 chains, rather
 * than linted here — adding typescript-eslint would pull a large dependency
 * tree for 14 files that are already type-checked, so it is a deliberate
 * omission, not an oversight. Note the ROOT `npm run typecheck` excludes
 * `monitor/` (see tsconfig.json), so naming that one here would have been the
 * same "declared but never runs" gap this config was added to close.
 * `service/` is Python. Neither is silently skipped: both are listed in the
 * ignores below with the reason.
 *
 * Type-level checking lives in tsconfig.json (strict, checkJs). This config
 * covers what types cannot: unused code, accidental globals, footguns.
 */

import js from "@eslint/js";
import globals from "globals";

/** Files that ship inside the extension zip: browser + chrome APIs. */
const EXTENSION_GLOB = [
  "background/**/*.js",
  "content/**/*.js",
  "config/**/*.js",
  "feedback/**/*.js",
  "lib/**/*.js",
  "options/**/*.js",
  "popup/**/*.js",
  "shared/**/*.js",
];

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "monitor/**", // TypeScript; covered by npm run typecheck:monitor (in tier2)
      "service/**", // Python; covered by pytest
      "spike/**", // Phase 0 throwaway, kept for the record only
      ".beads/**",
    ],
  },

  js.configs.recommended,

  {
    // Baseline for every linted file.
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // Unused vars are the rule that actually earns its keep here (dead
      // imports after a refactor). Allow the conventional underscore opt-out
      // and ignore rest-sibling omissions, which are a deliberate idiom.
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none", // `catch {}` and unused catch bindings are used deliberately
        ignoreRestSiblings: true,
      }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      "no-console": "off", // the service worker and dev tooling log deliberately
    },
  },

  {
    files: EXTENSION_GLOB,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions, // chrome.*
      },
    },
  },

  {
    // Unit tests: jsdom under Node, so they need both.
    files: ["**/__tests__/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  {
    // Dev tooling and the mock service run in Node.
    files: ["dev/**/*.{js,mjs}", "tools/**/*.js", "scripts/**/*.js", "*.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  {
    // Playwright drivers are Node scripts that ALSO contain page.evaluate()
    // callbacks, which are serialized and run inside the browser - so `document`
    // and, since this drives the loaded extension's own pages, `chrome` are
    // legitimately in scope there even though the file itself is Node.
    // capture-shots.mjs is deliberately NOT here: it declares its own `window`
    // for the chrome.* stub it injects, which these globals would collide with.
    files: ["dev/pages-smoke.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.webextensions },
    },
  },
];

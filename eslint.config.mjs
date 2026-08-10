import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  //
  // The originals here (".next/**" etc, no leading "**/") only anchor at the
  // repo root -- they don't match the same directory name showing up nested
  // (e.g. inside a git worktree). Found by running a full-repo lint and
  // seeing 51k+ "problems" that turned out to almost entirely be compiled
  // bundler output and Expo's web build getting linted as if it were source.
  globalIgnores([
    // Default ignores of eslint-config-next, made depth-agnostic:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Compiled/vendored output that was never meant to be linted as source:
    "public/solitaire/_expo/**",
    // Isolated agent worktrees (see .claude/worktrees/) are full copies of
    // the repo, each with their own .next/node_modules-adjacent build
    // output -- exclude the whole tree rather than relying on the patterns
    // above to reach every nested copy.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;

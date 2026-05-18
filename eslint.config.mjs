// ESLint 9 flat config for Next.js 16 + TypeScript.
// Project was scaffolded with --no-eslint; this adds lint without conflicting
// with Prettier (eslint-config-prettier is applied last to disable
// formatting-only rules so lint and format stay separate concerns).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      ".next/**",
      ".claude/worktrees/**",
      "node_modules/**",
      "drizzle/**",
      "build/**",
      "out/**",
      "next-env.d.ts",
      "*.config.*",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // Demoted to warn (not off): the codebase uses `catch (e: any)` in
      // src/lib (forbidden to modify logic here). Keep it visible without
      // failing CI; fix opportunistically when touching that code.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Must be last: turns off all ESLint formatting rules that conflict with Prettier.
  prettier,
];

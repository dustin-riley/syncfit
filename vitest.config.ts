import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/*.integration.test.ts", ".claude/worktrees/**"],
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});

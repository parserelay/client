import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve `@parserelay/core` to its source so client tests run without first
// building the core package (the client re-exports `isEnvelope` at runtime).
export default defineConfig({
  resolve: {
    alias: {
      "@parserelay/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

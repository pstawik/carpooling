import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone from astro.config.mjs: unit tests of pure functions must not start workerd.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/__tests__/**/*.test.mjs"],
  },
});

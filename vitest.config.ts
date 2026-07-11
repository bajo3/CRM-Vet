import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globalSetup: ["./tests/setup/global-setup.ts"],
    setupFiles: ["./tests/setup/env.ts"],
    // Los tests de integración corren contra Supabase remoto (schema `vet_test`); son más
    // lentos que en una base local y se ejecutan en serie para no agotar el pool de conexiones.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});

import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "bun:sqlite": resolve(__dirname, "src/__mocks__/bun-sqlite.ts"),
    },
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
})

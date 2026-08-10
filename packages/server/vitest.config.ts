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
    setupFiles: ["./src/__mocks__/bun-global-setup.ts"],
    server: {
      deps: {
        // @effect/sql-sqlite-bun imports the bare specifier "bun:sqlite" —
        // Vitest treats node_modules deps as external by default, which skips
        // Vite's resolver (and therefore the alias below) entirely. Inlining
        // it forces the import through Vite's resolution so the alias applies.
        inline: [/@effect\/sql-sqlite-bun/],
      },
    },
  },
})

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./app/vitest-setup.ts"],
    server: {
      deps: {
        inline: ["foldkit", "@foldkit/ui"],
      },
    },
  },
})

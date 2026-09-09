import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // เทสต์เป็น logic ล้วน (parser / queue engine / ranking import) ไม่แตะ DOM
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

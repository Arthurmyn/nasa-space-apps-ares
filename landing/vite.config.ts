import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5175,
    // In dev, forward the other parts of the site so the "Open the planner" link works.
    proxy: {
      "/app": "http://localhost:5173",
      "/api": "http://localhost:8000",
    },
  },
});

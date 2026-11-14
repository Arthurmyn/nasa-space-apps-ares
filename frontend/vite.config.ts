import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The planner is served under /app (the landing page is at the site root). The build output
  // also lives in dist/app; deploy/deploy.sh publishes it as is.
  base: "/app/",
  build: { outDir: "dist/app", emptyOutDir: true },
  envDir: "..", // read .env from the repository root
  server: { port: 5173 },
});

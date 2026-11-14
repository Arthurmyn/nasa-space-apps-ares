import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The planner is served under /app; the landing page owns /. Vercel passes the full path
  // through to the service, so the build output also lives in dist/app.
  base: "/app/",
  build: { outDir: "dist/app", emptyOutDir: true },
  envDir: "..", // читаем .env из корня репо
  server: { port: 5173 },
});

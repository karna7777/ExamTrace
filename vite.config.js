import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite builds the React renderer. Electron (Main process) loads this dev
// server during development and the built files from "dist" in production.
// We use a relative base ("./") so the built index.html works when Electron
// loads it from the local filesystem with loadFile().
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist"
  }
});

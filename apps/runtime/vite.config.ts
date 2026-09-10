import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" is required — the exported SCORM package is served from an
// LMS-assigned subdirectory (never a fixed absolute path), and must also be
// openable directly from disk for standalone preview.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
  },
});

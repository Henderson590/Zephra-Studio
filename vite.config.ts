import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src",
  base: process.env.NODE_ENV === "production" ? "./" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "../dist",
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      input: "src/index.html"
    }
  }
});

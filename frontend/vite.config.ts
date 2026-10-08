import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": root,
      "@ml": path.resolve(root, "..", "ml"),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(root, "..")] },
    proxy: {
      // FastAPI backend (see backend/app/main.py)
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:8000",
        changeOrigin: true,
        // Backend offline → clean 503 instead of a noisy proxy error (app is local-first).
        configure: (proxy) => {
          proxy.removeAllListeners('error');
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res && !res.headersSent) res.writeHead(503).end();
          });
        },
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // TensorFlow.js is ~2 MB; it is lazy-loaded with the Monitor / Data Lab routes only.
    chunkSizeWarningLimit: 2500,
  },
  test: {
    root: path.resolve(root, ".."),
    include: ["tests/frontend/**/*.test.ts"],
    environment: "node",
  },
});

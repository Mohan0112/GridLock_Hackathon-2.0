import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// In dev, proxy /api to the FastAPI backend on :8000.
// In production the backend serves the built dist/, so /api is same-origin.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: { "/api": "http://localhost:8000" },
    },
    build: { outDir: "dist", chunkSizeWarningLimit: 2000 },
});

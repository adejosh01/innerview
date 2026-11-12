import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    // The optional AI tutor runs as a separate local process (npm run tutor).
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});

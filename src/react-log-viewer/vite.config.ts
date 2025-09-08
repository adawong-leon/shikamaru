import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    proxy: {
      "/socket.io": {
        target: process.env.VITE_BACKEND_URL || "http://localhost:3001",
        ws: true,
      },
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://localhost:3001",
      },
    },
  },
});

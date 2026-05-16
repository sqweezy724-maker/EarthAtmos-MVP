import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host:true,
    proxy: {
      "/forecast": "http://localhost:8000",
      "/health": "http://localhost:8000",
      "/debug": "http://localhost:8000",
    },
  },
});

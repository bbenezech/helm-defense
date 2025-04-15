import { defineConfig } from "vite";

export default defineConfig(({ command, mode }) => ({
  plugins: [],
  base: mode === "gh-pages" ? `/helm-defence/` : "/",
  server: { host: "0.0.0.0", port: 9000 },
  clearScreen: false,
}));

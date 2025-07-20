import { defineConfig } from "vite";
import bodyParser from "body-parser";
import react from "@vitejs/plugin-react";
import { IncomingMessage } from "node:http";

const production = process.env["NODE_ENV"] === "production";
const development = !production;
const host = process.env["HOST"] || "0.0.0.0";
const port = Number.parseInt(process.env["PORT"] || "9000");

export default defineConfig(({ mode }) => ({
  assetsInclude: ["**/*.glsl", "**/*.frag", "**/*.vert"],
  base: mode === "gh-pages" ? `/helm-defense/` : "./",
  esbuild: { sourcemap: false, target: "esnext" },
  server: {
    host,
    port,
    open: mode === "web",
    strictPort: true,
    sourcemapIgnoreList: () => true,
    watch: {
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/.github/**",
        "**/.vscode/**",
        "**/assets/**",
        "**/public/**",
      ],
    },
  },
  build: { chunkSizeWarningLimit: 2000, sourcemap: false, target: "esnext" },
  hmr: host ? { protocol: "ws", host, port: port + 1 } : undefined,
  clearScreen: false,
  plugins: development
    ? [
        react(),
        {
          name: "log-viewer-middleware",
          configureServer(server) {
            server.middlewares.use(bodyParser.json());
            server.middlewares.use("/api/log", (request: IncomingMessage, response, next) => {
              if (request.method === "POST") {
                // @ts-expect-error no body in IncomingMessage?
                console.log("[Client]:", ...(request.body?.messages ?? []));
                response.statusCode = 200;
                response.end();
              } else {
                next();
              }
            });
          },
        },
      ]
    : [react()],
}));

import { defineConfig } from "vite";
import bodyParser from "body-parser";

export default defineConfig(({ mode }) => ({
  base: mode === "gh-pages" ? `/helm-defence/` : "/",
  server: { host: "0.0.0.0", port: 9000, open: true },
  plugins:
    mode === "gh-pages"
      ? []
      : [
          {
            name: "log-viewer-middleware",
            configureServer(server) {
              server.middlewares.use(bodyParser.json());
              server.middlewares.use("/api/log", (req: any, res, next) => {
                if (req.method === "POST") {
                  console.log("[Client]:", ...req.body.messages);
                  res.statusCode = 200;
                  res.end();
                } else {
                  next();
                }
              });
            },
          },
        ],
}));

import express from "express";
import { createServer } from "http";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  const isProd = process.env.NODE_ENV === "production";
  console.log(`Starting server in ${isProd ? 'production' : 'development'} mode`);

  let vite: any;
  if (!isProd) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
  }

  // API routes or other handlers could go here

  // For SPA support: Fallback to index.html
  app.get("*", async (req, res, next) => {
    const url = req.originalUrl;
    
    // Safety check: if the request is for a script/style that should have been caught by 
    // static middleware or vite, but wasn't, return a 404 instead of index.html
    const ext = path.extname(url);
    if (ext && ext !== '.html') {
      return res.status(404).end();
    }

    try {
      let template: string;
      if (!isProd) {
        // In development, load and transform index.html
        template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
      } else {
        // In production, just load index.html from dist
        template = fs.readFileSync(path.resolve(__dirname, "dist", "index.html"), "utf-8");
      }
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e: any) {
      if (!isProd) vite.ssrFixStacktrace(e);
      console.error(e);
      res.status(500).end(e.message);
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

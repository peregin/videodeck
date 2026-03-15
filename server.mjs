import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { attachRenderRoutes, defaultPort } from './render/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;
const distDir = path.join(projectRoot, 'dist');

const startServer = async () => {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  attachRenderRoutes(app);

  if (isProduction) {
    app.use(express.static(distDir));
    app.use((_, response) => {
      response.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);
    app.use(async (request, response, next) => {
      try {
        const url = request.originalUrl;
        const indexHtml = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
        const template = await vite.transformIndexHtml(url, indexHtml);
        response.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        next(error);
      }
    });
  }

  app.listen(defaultPort, () => {
    console.log(`VideoDeck listening on http://localhost:${defaultPort}`);
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startServer();
}

export { startServer };

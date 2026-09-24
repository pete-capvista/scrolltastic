import { defineConfig, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Limit the SPA fallback to reader routes. Missing data/assets must stay 404s.
function readerRouting(): Plugin {
  const rewrite = (request: IncomingMessage, _response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0] ?? '';
    if (path === '/' || /^\/s\/[^/.]+\/?$/.test(path)) request.url = '/index.html';
    next();
  };
  return {
    name: 'reader-routing',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); },
  };
}
export default defineConfig({
  appType: 'mpa', plugins: [readerRouting()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});

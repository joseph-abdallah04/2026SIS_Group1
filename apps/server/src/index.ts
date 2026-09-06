import cors from 'cors';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Server as SocketServer } from 'socket.io';

import { env } from './env.js';
import { errorHandler } from './middleware/error.js';
import { authRoutes } from './modules/auth/index.js';
import { pinboardRoutes } from './modules/pinboard/index.js';
import { createSessionsRoutes } from './modules/sessions/index.js';
import { registerRealtimeGateway } from './realtime/gateway.js';
import type { RealtimeServer } from './realtime/types.js';

const PORT = env.PORT;
const CLIENT_ORIGIN = env.CLIENT_ORIGIN;

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '256kb' }));

// `io` is created before the routes that need it (rather than after, as
// there is no socket-only reason to delay it) — F09's `POST /:id/start`
// broadcasts on this exact instance once it succeeds, so `sessionsRoutes`
// is a factory that takes it, not a module-level `Router`.
const httpServer = http.createServer(app);
const io: RealtimeServer = new SocketServer(httpServer, { cors: { origin: CLIENT_ORIGIN } });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'roundtable-server' });
});

app.use('/api/auth', authRoutes);
// Two routers share the `/api/sessions` prefix, so registration order
// matters: sessions' `GET /:id` matches any single segment and would shadow a
// one-segment route added to pinboard later. Pinboard's routes are all
// `/:sessionId/<something>`, so nothing collides today — keep it that way, or
// mount pinboard first.
app.use('/api/sessions', createSessionsRoutes(io));
app.use('/api/sessions', pinboardRoutes);

app.use(errorHandler);

// Serve the built SPA in production (docs/02 §9). No-op in dev, where Vite serves the frontend.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback: non-API GETs get index.html so client-side routes (/login, /sessions/:id) work.
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

registerRealtimeGateway(io);

httpServer.on('error', (err) => {
  console.error('HTTP server failed to start:', err);
  process.exit(1);
});

// Bind all interfaces: Render's health check reaches the container on
// 0.0.0.0:$PORT, so a loopback-only bind fails to deploy.
httpServer.listen(PORT, () => {
  console.log(`roundtable-server listening on :${PORT}`);
});

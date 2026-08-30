import cors from 'cors';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Server as SocketServer } from 'socket.io';

import { env } from './env.js';
import { errorHandler } from './middleware/error.js';
import { assistantRouter } from './modules/assistant/index.js';

const PORT = env.PORT;
const CLIENT_ORIGIN = env.CLIENT_ORIGIN;

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'roundtable-server' });
});

// Module owners mount their routers here (docs/02 §6):
//   app.use('/api/auth', authRoutes) etc. Each module exports an index.ts with its public surface.
//
// The assistant owns `/api/me/llm-config*` and `/api/sessions/:id/assistant/*`; both live
// under one router, so it mounts at `/api` rather than a module-shaped prefix.
app.use('/api', assistantRouter);

// Error handler goes after every route: Express only reaches it for requests the routes
// above threw on.
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

const httpServer = http.createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: CLIENT_ORIGIN } });

io.on('connection', (socket) => {
  console.log(`socket connected: ${socket.id}`);
  socket.on('disconnect', (reason) => {
    console.log(`socket disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`roundtable-server listening on :${PORT}`);
});

import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'roundtable-server' });
});

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

import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { config } from './config.js';
import { UPLOAD_DIR } from './db/index.js';
import { ApiError, optionalAuth } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { userRouter } from './routes/users.js';
import { videoRouter } from './routes/videos.js';
import { commentRouter } from './routes/comments.js';
import { discoverRouter, notificationRouter } from './routes/discover.js';
import { messageRouter } from './routes/messages.js';
import { liveRouter } from './routes/live.js';
import { shopRouter } from './routes/shop.js';
import { attachRealtime, seedGifts } from './realtime.js';

seedGifts();

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      cb(new Error('Origine non autorisée par CORS'));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(optionalAuth);

app.use(
  '/media',
  express.static(UPLOAD_DIR, {
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('Accept-Ranges', 'bytes'),
  }),
);

app.get('/api/health', (_req, res) => res.json({ ok: true, brand: config.brand, ts: Date.now() }));
app.get('/health', (_req, res) => res.json({ ok: true, brand: config.brand, ts: Date.now() }));

// Mount routes with both /api and root prefix
const routePairs: [string, express.Router][] = [
  ['/auth', authRouter],
  ['/users', userRouter],
  ['/videos', videoRouter],
  ['/comments', commentRouter],
  ['/discover', discoverRouter],
  ['/notifications', notificationRouter],
  ['/messages', messageRouter],
  ['/live', liveRouter],
  ['/shop', shopRouter],
];

for (const [path, router] of routePairs) {
  app.use(`/api${path}`, router);
  app.use(path, router);
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue' }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message, code: err.code });
  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (/MulterError|File too large/.test(message)) return res.status(413).json({ error: 'Fichier trop volumineux' });
  console.error('[y]', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

const server = createServer(app);
attachRealtime(server);

server.listen(config.port, config.host, () => {
  console.log(`[${config.brand}] API -> http://localhost:${config.port}`);
});

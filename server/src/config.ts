import { randomBytes } from 'node:crypto';

const secretFromEnv = process.env.Y_SECRET;

const defaultCorsOrigins = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174'

export const config = {
  port: Number(process.env.Y_PORT ?? 4000),
  host: process.env.Y_HOST ?? '0.0.0.0',
  jwtSecret: secretFromEnv ?? randomBytes(32).toString('hex'),
  jwtTtl: Number(process.env.Y_JWT_TTL ?? 60 * 60 * 24 * 7),
  refreshTtl: Number(process.env.Y_REFRESH_TTL ?? 60 * 60 * 24 * 30),
  corsOrigins: (process.env.Y_CORS ?? defaultCorsOrigins).split(',').map((o) => o.trim()).filter(Boolean),
  maxUploadMb: Number(process.env.Y_MAX_UPLOAD_MB ?? 200),
  brand: process.env.Y_BRAND ?? 'Y',
};

if (!secretFromEnv && process.env.NODE_ENV === 'production') {
  throw new Error('Y_SECRET doit être défini en production');
}

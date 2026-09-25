import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';

import { env, isProd } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import authRoutes from './modules/auth/routes.js';
import membersRoutes from './modules/members/routes.js';
import familyRoutes from './modules/family/routes.js';
import foldersRoutes from './modules/folders/routes.js';
import documentsRoutes from './modules/documents/routes.js';
import filesRoutes from './modules/files/routes.js';
import sharesRoutes from './modules/shares/routes.js';
import publicRoutes from './modules/public/routes.js';
import activityRoutes from './modules/activity/routes.js';
import statsRoutes from './modules/stats/routes.js';
import itemsRoutes from './modules/items/routes.js';
import meRoutes from './modules/me/routes.js';
import platformRoutes from './modules/platform/routes.js';
import binRoutes from './modules/bin/routes.js';
import searchRoutes from './modules/search/routes.js';

export function createApp() {
  const app = express();

  // Render sits behind a proxy — needed for correct req.ip (rate limiting, IP hashing) and
  // for express-rate-limit to trust X-Forwarded-For.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Files are served through /api/files, never rendered as top-level HTML/SVG documents,
      // so a strict default CSP here doesn't fight the client SPA (served separately by Vercel).
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' })); // file bytes go through multipart, not JSON
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(mongoSanitize());
  app.use(hpp());

  // Strict limiter on auth + public share endpoints (brute-force surfaces); a generous default
  // elsewhere so normal browsing/uploading isn't throttled.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
  const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });

  app.use('/api/auth', authLimiter);
  app.use('/api/public', publicLimiter);
  app.use('/api', apiLimiter);

  app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/members', membersRoutes);
  app.use('/api/family', familyRoutes);
  app.use('/api/folders', foldersRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/files', filesRoutes);
  app.use('/api/shares', sharesRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/activity', activityRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/items', itemsRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/platform-settings', platformRoutes);
  app.use('/api/bin', binRoutes);
  app.use('/api/search', searchRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (!isProd) {
    // eslint-disable-next-line no-console
    console.log('[app] running in development mode');
  }

  return app;
}

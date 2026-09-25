import dns from 'node:dns';
// Force a public DNS resolver so MongoDB Atlas SRV/TXT lookups succeed even when
// the local/ISP resolver refuses them (the cause of querySrv ECONNREFUSED).
dns.setServers(['1.1.1.1', '8.8.8.8']);


import { createApp } from './app.js';
import { connectDB } from './db/connect.js';
import { env } from './config/env.js';
import { backfillDeletedAt } from './models/plugins/softDelete.js';
import { Document } from './models/Document.js';
import { Folder } from './models/Folder.js';
import { VaultItem } from './models/VaultItem.js';

async function main() {
  await connectDB();
  // Idempotent: gives pre-soft-delete rows an explicit `deletedAt: null` (docs/DECISIONS.md
  // "Soft delete / recycle bin"). Never blocks startup — no query depends on it for correctness.
  try {
    const fixed = await backfillDeletedAt([Document, Folder, VaultItem]);
    const total = Object.values(fixed).reduce((a, b) => a + b, 0);
    // eslint-disable-next-line no-console
    if (total > 0) console.log('[db] backfilled deletedAt on legacy rows', fixed);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db] deletedAt backfill failed (non-fatal)', err);
  }
  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] failed to start', err);
  process.exit(1);
});

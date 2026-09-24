import dns from 'node:dns';
// Force a public DNS resolver so MongoDB Atlas SRV/TXT lookups succeed even when
// the local/ISP resolver refuses them (the cause of querySrv ECONNREFUSED).
dns.setServers(['1.1.1.1', '8.8.8.8']);


import { createApp } from './app.js';
import { connectDB } from './db/connect.js';
import { env } from './config/env.js';

async function main() {
  await connectDB();
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

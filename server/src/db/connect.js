import mongoose from 'mongoose';
import { env } from '../config/env.js';

let connectPromise = null;

/**
 * Connect once and reuse the connection. Safe to call from server.js and from tests
 * (tests instead point MONGODB_URI at an in-memory mongodb-memory-server instance).
 */
export function connectDB() {
  if (connectPromise) return connectPromise;
  mongoose.set('strictQuery', true);
  connectPromise = mongoose.connect(env.MONGODB_URI).then((m) => {
    // eslint-disable-next-line no-console
    console.log(`[db] connected to ${maskUri(env.MONGODB_URI)}`);
    return m;
  });
  return connectPromise;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  connectPromise = null;
}

function maskUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

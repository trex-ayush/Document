import './setupEnv.js';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod = null;

/** Start an in-memory MongoDB and connect mongoose to it. Call once in a suite's beforeAll. */
export async function startTestDb() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  return uri;
}

/** Disconnect + stop the in-memory server. Call once in a suite's afterAll. */
export async function stopTestDb() {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

/** Drop every collection's documents between tests without dropping indexes. */
export async function clearDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

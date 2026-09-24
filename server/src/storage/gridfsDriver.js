import mongoose from 'mongoose';
import { Readable } from 'node:stream';

// Default storage driver — zero extra infra beyond MONGODB_URI. Note (README too): MongoDB Atlas's
// free (M0) tier caps total storage at 512MB, which includes GridFS chunks.
const BUCKET_NAME = 'fv_files';

function bucket() {
  const conn = mongoose.connection;
  if (conn.readyState !== 1) {
    throw new Error('GridFS driver used before Mongo connection is established');
  }
  return new mongoose.mongo.GridFSBucket(conn.db, { bucketName: BUCKET_NAME });
}

export const gridfsDriver = {
  async put(key, buffer, meta = {}) {
    await new Promise((resolve, reject) => {
      const uploadStream = bucket().openUploadStream(key, { metadata: meta });
      Readable.from(buffer)
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', resolve);
    });
    return { key, size: buffer.length };
  },

  async getBuffer(key) {
    const chunks = [];
    await new Promise((resolve, reject) => {
      bucket()
        .openDownloadStreamByName(key)
        .on('data', (chunk) => chunks.push(chunk))
        .on('error', reject)
        .on('end', resolve);
    });
    return Buffer.concat(chunks);
  },

  // `range` is a byte range on the DECRYPTED plaintext when callers need it; GridFS itself is
  // read as a whole here (files are modest — <=20MB) and range-serving of the *decrypted*
  // stream is handled one layer up in the files route.
  async getStream(key) {
    const files = await bucket().find({ filename: key }).toArray();
    if (!files.length) return null;
    const size = files[0].length;
    return { stream: bucket().openDownloadStreamByName(key), size };
  },

  async delete(key) {
    const files = await bucket().find({ filename: key }).toArray();
    await Promise.all(files.map((f) => bucket().delete(f._id).catch(() => {})));
  },

  async stat(key) {
    const files = await bucket().find({ filename: key }).toArray();
    if (!files.length) return null;
    return { size: files[0].length };
  },
};

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

// Any S3-compatible bucket: Cloudflare R2, Backblaze B2, AWS S3. S3_ENDPOINT is set for
// R2/B2 (path-style); leave it unset for real AWS S3 (virtual-hosted style, default endpoint).
const client = new S3Client({
  region: env.S3_REGION || 'auto',
  endpoint: env.S3_ENDPOINT || undefined,
  forcePathStyle: Boolean(env.S3_ENDPOINT),
  credentials: env.S3_ACCESS_KEY_ID
    ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
    : undefined,
});

function assertConfigured() {
  if (!env.S3_BUCKET) {
    throw new Error('STORAGE_DRIVER=s3 but S3_BUCKET is not set');
  }
}

export const s3Driver = {
  async put(key, buffer, meta = {}) {
    assertConfigured();
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buffer,
        Metadata: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, String(v)])),
      }),
    );
    return { key, size: buffer.length };
  },

  async getBuffer(key) {
    assertConfigured();
    const res = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  },

  async getStream(key) {
    assertConfigured();
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return { stream: res.Body, size: res.ContentLength };
    } catch (err) {
      if (err?.name === 'NoSuchKey') return null;
      throw err;
    }
  },

  async delete(key) {
    assertConfigured();
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  },

  async stat(key) {
    assertConfigured();
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return { size: res.ContentLength };
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  },
};

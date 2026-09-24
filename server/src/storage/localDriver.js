import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// Dev-only convenience driver — writes under server/uploads/ (gitignored). Never selected in
// production guidance (Render's disk is ephemeral); STORAGE_DRIVER defaults to "gridfs".
const ROOT = path.resolve(process.cwd(), 'uploads');

function resolveSafe(key) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT)) throw new Error('Invalid storage key');
  return full;
}

export const localDriver = {
  async put(key, buffer) {
    const full = resolveSafe(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, buffer);
    return { key, size: buffer.length };
  },

  async getBuffer(key) {
    return fsp.readFile(resolveSafe(key));
  },

  async getStream(key) {
    const full = resolveSafe(key);
    const st = await fsp.stat(full).catch(() => null);
    if (!st) return null;
    return { stream: fs.createReadStream(full), size: st.size };
  },

  async delete(key) {
    await fsp.rm(resolveSafe(key), { force: true });
  },

  async stat(key) {
    const st = await fsp.stat(resolveSafe(key)).catch(() => null);
    return st ? { size: st.size } : null;
  },
};

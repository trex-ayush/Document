import { env } from '../config/env.js';

/**
 * Storage adapter interface every driver implements. Modules import ONLY `getStorage()` from
 * this file — never a driver directly — so swapping STORAGE_DRIVER never touches module code.
 *
 *   put(key, buffer, meta)   -> Promise<{ key, size }>
 *   getBuffer(key)           -> Promise<Buffer>
 *   getStream(key, range?)   -> Promise<{ stream, size, range? }>
 *   delete(key)              -> Promise<void>
 *   stat(key)                -> Promise<{ size } | null>
 */

let cachedDriver = null;

export async function getStorage() {
  if (cachedDriver) return cachedDriver;

  switch (env.STORAGE_DRIVER) {
    case 's3': {
      const { s3Driver } = await import('./s3Driver.js');
      cachedDriver = s3Driver;
      break;
    }
    case 'local': {
      const { localDriver } = await import('./localDriver.js');
      cachedDriver = localDriver;
      break;
    }
    case 'gridfs':
    default: {
      const { gridfsDriver } = await import('./gridfsDriver.js');
      cachedDriver = gridfsDriver;
      break;
    }
  }
  return cachedDriver;
}

/** Generate a namespaced storage key. Callers pass their own prefix (e.g. `families/<id>/files/<uuid>`). */
export function makeStorageKey(...parts) {
  return parts.filter(Boolean).join('/');
}

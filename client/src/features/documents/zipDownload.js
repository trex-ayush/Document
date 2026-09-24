import toast from 'react-hot-toast';
import { filesApi } from '@/services/filesApi.js';

/**
 * Resolves a `{ url }` zip-link response (folder/document zip-link
 * endpoints, docs/API.md) into a real browser download. Shared by Browse's
 * "download folder as ZIP" and Document detail's "download all files".
 *
 * @param {Promise<{url:string}>} zipLinkPromise
 * @param {string} filename
 */
export async function downloadZipFrom(zipLinkPromise, filename) {
  const toastId = toast.loading('Preparing ZIP…');
  try {
    const { url } = await zipLinkPromise;
    filesApi.triggerDownload(url, filename);
    toast.success('Download started', { id: toastId });
  } catch (err) {
    toast.error(err?.response?.data?.message || 'Could not prepare the ZIP', { id: toastId });
  }
}

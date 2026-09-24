import toast from 'react-hot-toast';
import { filesApi } from '@/services/filesApi.js';
import i18n from '@/i18n/index.js';

/**
 * Resolves a `{ url }` zip-link response (folder/document zip-link
 * endpoints, docs/API.md) into a real browser download. Shared by Browse's
 * "download folder as ZIP" and Document detail's "download all files".
 *
 * @param {Promise<{url:string}>} zipLinkPromise
 * @param {string} filename
 */
export async function downloadZipFrom(zipLinkPromise, filename) {
  const toastId = toast.loading(i18n.t('documents:zip.preparing', 'Preparing ZIP…'));
  try {
    const { url } = await zipLinkPromise;
    filesApi.triggerDownload(url, filename);
    toast.success(i18n.t('documents:zip.downloadStarted', 'Download started'), { id: toastId });
  } catch (err) {
    toast.error(err?.response?.data?.message || i18n.t('documents:zip.prepareFailed', 'Could not prepare the ZIP'), { id: toastId });
  }
}

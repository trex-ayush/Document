// `document.view` is logged at most once per membership per document per 10 minutes (per
// docs/API.md). A per-process in-memory map is enough here — undercounting after a server
// restart, or across horizontally-scaled instances, only means an extra activity row gets logged
// occasionally, which is harmless (this is a view-log throttle, not a security control).
const TTL_MS = 10 * 60 * 1000;
const lastViewedAt = new Map(); // `${membershipId}:${documentId}` -> timestamp

export function shouldLogView(membershipId, documentId) {
  const key = `${membershipId}:${documentId}`;
  const now = Date.now();
  const last = lastViewedAt.get(key);
  if (last && now - last < TTL_MS) return false;
  lastViewedAt.set(key, now);

  if (lastViewedAt.size > 10000) {
    for (const [k, t] of lastViewedAt) {
      if (now - t > TTL_MS) lastViewedAt.delete(k);
    }
  }
  return true;
}

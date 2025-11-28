import cache from './cache.js';

async function getGroupMetadata(conn, jid) {
  if (!jid?.endsWith?.('@g.us')) return null;

  const cacheKey = `group:${jid}:meta`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return cached;
      }
    }
  } catch (e) {
    // cache errors are non-fatal
  }

  const metadata = await conn.groupMetadata(jid);
  try {
    await cache.set(cacheKey, JSON.stringify(metadata), 300);
  } catch (e) {
    // ignore
  }
  return metadata;
}

export { getGroupMetadata };


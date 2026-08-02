const store = new Map();

/** TTL'i dolmamış değeri döner, yoksa fetcher'ı çalıştırıp sonucu saklar. */
export async function cached(key, ttlMs, fetcher) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await fetcher();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

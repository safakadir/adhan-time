const DEFAULT_TIMEOUT = 10000;

/** Timeout'lu JSON isteği. Başarısız HTTP kodlarında hata fırlatır. */
export async function getJson(url, { timeout = DEFAULT_TIMEOUT, headers = {} } = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { 'User-Agent': 'namaz-vakti-api/1.0 (kisisel kullanim)', ...headers },
  });

  if (!res.ok) {
    throw new Error(`${new URL(url).host} isteği ${res.status} döndü`);
  }
  return res.json();
}

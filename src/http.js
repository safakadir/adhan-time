const DEFAULT_TIMEOUT = 10000;

/**
 * Cloudflare arkasındaki kaynaklar sade istemci başlıklarını bot sayabildiği için
 * tarayıcıya benzer bir başlık seti gönderiyoruz.
 */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
};

/**
 * Timeout'lu JSON isteği. Geçici hatalarda (rate limit, sunucu hatası) bir kez
 * bekleyip yeniden dener; kalıcı hatalarda (403, 404) beklemeden hata fırlatır.
 */
export async function getJson(url, options = {}) {
  try {
    return await request(url, options);
  } catch (err) {
    if (!err.retryable) throw err;

    await new Promise((r) => setTimeout(r, 1500));
    return request(url, options);
  }
}

async function request(url, { timeout = DEFAULT_TIMEOUT, headers = {} } = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { ...BROWSER_HEADERS, ...headers },
  });

  if (!res.ok) {
    // Engellenme sebebini (WAF bloğu, rate limit, challenge) loglardan görebilmek için
    // gövdenin başını hataya iliştiriyoruz.
    const detay = await res.text().catch(() => '');
    const özet = detay.replace(/\s+/g, ' ').trim().slice(0, 120);
    const err = new Error(
      `${new URL(url).host} isteği ${res.status} döndü${özet ? ` — ${özet}` : ''}`
    );
    err.status = res.status;
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  return res.json();
}

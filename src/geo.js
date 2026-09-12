import { getJson } from './http.js';
import { cached, DAY, MINUTE } from './cache.js';
import { matches, normalize } from './text.js';

const BIGDATACLOUD = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const NOMINATIM = process.env.NOMINATIM_BASE || 'https://nominatim.openstreetmap.org/search';
const OPEN_METEO = 'https://geocoding-api.open-meteo.com/v1/search';

// Nominatim kullanım politikası kendini tanıtan bir User-Agent istiyor.
const NOMINATIM_UA =
  process.env.NOMINATIM_UA ||
  'namaz-vakti-api/1.0 (+https://github.com/safakadir/adhan-time)';

// Nominatim paylaşımlı sunucu IP'lerine (Render, Fly vb.) kolayca 429 dönüyor.
// Rate limit yediğimizde bir süre hiç denemeyip doğrudan yedek kaynağa gidiyoruz;
// yoksa her istek önce boşuna 429 bekler.
const NOMINATIM_COOLDOWN_MS = 30 * MINUTE;
let nominatimRetryAt = 0;

/**
 * Koordinattan idari birim bilgisi çıkarır.
 * BigDataCloud'un localityInfo.administrative dizisinde Türkiye için
 * adminLevel 4 = il, adminLevel 6 = ilçe olarak geliyor.
 */
export async function reverseGeocode(lat, lng) {
  // Yakın koordinatlar aynı ilçeye düşer; cache anahtarını ~100m'ye yuvarlıyoruz.
  const key = `geo:${lat.toFixed(3)},${lng.toFixed(3)}`;

  return cached(key, 30 * DAY, async () => {
    const url = `${BIGDATACLOUD}?latitude=${lat}&longitude=${lng}&localityLanguage=tr`;
    const data = await getJson(url);

    const levels = data.localityInfo?.administrative ?? [];
    const atLevel = (n) => levels.filter((a) => a.adminLevel === n).pop()?.name;

    const il = atLevel(4) || data.principalSubdivision || data.city;
    const ilce = atLevel(6) || data.city || data.locality;

    return {
      lat,
      lng,
      countryCode: data.countryCode,
      il: il || null,
      ilce: ilce || null,
      displayName: buildDisplayName(ilce, il, data.countryName),
    };
  });
}

/**
 * İl/ilçe adından koordinat bulur. Koordinatlı akışla aynı şekli döndürdüğü için
 * sonrasında tek bir kaynak seçim mantığı çalışır. Yer bulunamazsa null döner —
 * yanlış yazılmış bir isim için sessizce rastgele bir konuma düşmeyi engeller.
 *
 * Tek bir sağlayıcıya bağlı kalmıyoruz: Nominatim rate limit yediğinde (429)
 * Open-Meteo'nun geocoding ucu devreye giriyor.
 */
export async function geocodePlace(il, ilce, ulke = 'Türkiye') {
  const sorgu = [ilce, il, ulke].filter(Boolean).join(', ');

  return cached(`fwd:${normalize(sorgu)}`, 30 * DAY, async () => {
    let sonHata = null;
    let cevapVeren = false;

    for (const provider of [nominatimSearch, openMeteoSearch]) {
      try {
        const hit = await provider(il, ilce, ulke, sorgu);
        if (hit) return hit;
        cevapVeren = true;
      } catch (err) {
        sonHata = err;
        console.warn(`Geocoding kaynağı atlandı (${provider.name}): ${err.message}`);
      }
    }

    // En az bir kaynak sağlıklı cevap verip "yok" dediyse gerçekten bulunamamıştır.
    // Hepsi hata verdiyse bunu "yer bulunamadı" saymak yanıltıcı olur; hatayı
    // yukarı taşıyıp çağıranın 502 dönmesini sağlıyoruz.
    if (!cevapVeren && sonHata) throw sonHata;
    return null;
  });
}

async function nominatimSearch(il, ilce, ulke, sorgu) {
  if (Date.now() < nominatimRetryAt) return null;

  const url =
    `${NOMINATIM}?q=${encodeURIComponent(sorgu)}` +
    '&format=json&limit=1&addressdetails=1&accept-language=tr';

  let hit;
  try {
    [hit] = await getJson(url, { headers: { 'User-Agent': NOMINATIM_UA } });
  } catch (err) {
    if (err.status === 429 || err.status === 403) {
      nominatimRetryAt = Date.now() + NOMINATIM_COOLDOWN_MS;
      console.warn(
        `Nominatim ${Math.round(NOMINATIM_COOLDOWN_MS / MINUTE)} dk devre dışı: ${err.message}`
      );
    }
    throw err;
  }

  if (!hit) return null;

  const adres = hit.address ?? {};
  const bulunanIl = adres.province ?? adres.state ?? il;
  const bulunanIlce = adres.town ?? adres.county ?? adres.city ?? adres.village ?? ilce;

  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    countryCode: (adres.country_code ?? '').toUpperCase(),
    il: bulunanIl || null,
    ilce: bulunanIlce || null,
    displayName: buildDisplayName(bulunanIlce, bulunanIl, adres.country),
  };
}

/**
 * Open-Meteo yalnızca tek bir yer adı alıyor ve eşleşmesi Nominatim'den gevşek:
 * "Kadıköy" sorgusu başka ildeki aynı adlı köyü de döndürebiliyor. Bu yüzden önce
 * ilçeyi il adıyla doğrulayarak arıyoruz; doğrulanamazsa aynı adlı başka bir yere
 * düşmek yerine il merkezine geri çekiliyoruz.
 */
async function openMeteoSearch(il, ilce, ulke) {
  if (ilce) {
    const hit = await openMeteoLookup(ilce, il, ulke, true);
    if (hit) return hit;
  }

  return il ? openMeteoLookup(il, null, ulke, false) : null;
}

async function openMeteoLookup(ad, il, ulke, ilceAraniyor) {
  const url = `${OPEN_METEO}?name=${encodeURIComponent(ad)}&count=10&language=tr&format=json`;
  const { results = [] } = await getJson(url);

  const ulkeTutuyor = (r) =>
    !ulke ||
    matches(r.country_code, ulke) ||
    normalize(r.country ?? '').includes(normalize(ulke));

  const hit = results.find(
    (r) => matches(r.name, ad) && ulkeTutuyor(r) && (!il || matches(r.admin1, il))
  );
  if (!hit) return null;

  // admin2 "Gazipaşa İlçesi" gibi gelebiliyor; ekranda gösterilen adı sadeleştiriyoruz.
  const ilceAdi = ilceAraniyor ? hit.admin2?.replace(/\s+İlçesi$/i, '') || hit.name : null;

  return {
    lat: hit.latitude,
    lng: hit.longitude,
    countryCode: (hit.country_code ?? '').toUpperCase(),
    il: hit.admin1 || il || null,
    ilce: ilceAdi,
    displayName: buildDisplayName(ilceAdi, hit.admin1 || il || hit.name, hit.country),
  };
}

function buildDisplayName(ilce, il, ulke) {
  const parts = [ilce, il].filter(Boolean);
  const unique = [...new Set(parts)];
  if (unique.length > 0) return unique.join('/');
  return ulke || 'Bilinmeyen konum';
}

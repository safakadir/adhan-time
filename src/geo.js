import { getJson } from './http.js';
import { cached, DAY } from './cache.js';

const BIGDATACLOUD = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Nominatim kullanım politikası kendini tanıtan bir User-Agent istiyor.
const NOMINATIM_UA = 'namaz-vakti-api/1.0 (kisisel kullanim)';

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
 */
export async function geocodePlace(il, ilce, ulke = 'Türkiye') {
  const sorgu = [ilce, il, ulke].filter(Boolean).join(', ');

  return cached(`fwd:${sorgu.toLocaleLowerCase('tr')}`, 30 * DAY, async () => {
    const url =
      `${NOMINATIM}?q=${encodeURIComponent(sorgu)}` +
      '&format=json&limit=1&addressdetails=1&accept-language=tr';

    const [hit] = await getJson(url, { headers: { 'User-Agent': NOMINATIM_UA } });
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
  });
}

function buildDisplayName(ilce, il, ulke) {
  const parts = [ilce, il].filter(Boolean);
  const unique = [...new Set(parts)];
  if (unique.length > 0) return unique.join('/');
  return ulke || 'Bilinmeyen konum';
}

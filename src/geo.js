import { getJson } from './http.js';
import { cached, DAY } from './cache.js';

const BIGDATACLOUD = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

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
      countryCode: data.countryCode,
      countryName: data.countryName,
      il: il || null,
      ilce: ilce || null,
      // "Gazipaşa/Antalya" — ilçe ile il aynıysa (Berlin gibi) tek isim kalsın.
      displayName: buildDisplayName(ilce, il, data.countryName),
    };
  });
}

function buildDisplayName(ilce, il, ulke) {
  const parts = [ilce, il].filter(Boolean);
  const unique = [...new Set(parts)];
  if (unique.length > 0) return unique.join('/');
  return ulke || 'Bilinmeyen konum';
}

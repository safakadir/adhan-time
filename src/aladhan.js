import { getJson } from './http.js';
import { cached, HOUR } from './cache.js';

const BASE = 'https://api.aladhan.com/v1';
const DIYANET_METHOD = 13; // Aladhan'ın "Diyanet İşleri Başkanlığı, Turkey" hesaplama yöntemi

/**
 * Diyanet tablosunda karşılığı olmayan konumlar (yurt dışı, eşleşmeyen ilçe) için
 * yedek kaynak. Diyanet'in hesaplama parametreleriyle çalışır, resmi tablo değildir.
 */
export async function fetchAladhanTimes(lat, lng) {
  const key = `aladhan:${lat.toFixed(2)},${lng.toFixed(2)}:${new Date().toISOString().slice(0, 10)}`;

  const data = await cached(key, 12 * HOUR, () =>
    getJson(`${BASE}/calendar?latitude=${lat}&longitude=${lng}&method=${DIYANET_METHOD}`)
  );

  const timezone = data.data[0]?.meta?.timezone ?? 'UTC';

  return {
    source: 'aladhan',
    timezone,
    days: data.data.map((g) => ({
      date: toIsoDate(g.date.gregorian.date),
      times: {
        'İmsak': clean(g.timings.Imsak),
        'Güneş': clean(g.timings.Sunrise),
        'Öğle': clean(g.timings.Dhuhr),
        'İkindi': clean(g.timings.Asr),
        'Akşam': clean(g.timings.Maghrib),
        'Yatsı': clean(g.timings.Isha),
      },
    })),
  };
}

/** "04:19 (+03)" -> "04:19" */
function clean(timing) {
  return timing.split(' ')[0];
}

/** "02-08-2026" -> "2026-08-02" */
function toIsoDate(ddMMyyyy) {
  const [d, m, y] = ddMMyyyy.split('-');
  return `${y}-${m}-${d}`;
}

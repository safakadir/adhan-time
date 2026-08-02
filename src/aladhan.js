import { getJson } from './http.js';
import { cached, HOUR } from './cache.js';

const BASE = 'https://api.aladhan.com/v1';
const DIYANET_METHOD = 13; // Aladhan'ın "Diyanet İşleri Başkanlığı, Turkey" hesaplama yöntemi

/**
 * Diyanet tablosuna ulaşılamayan durumlar (yurt dışı, eşleşmeyen ilçe, engellenen
 * kaynak) için yedek. Diyanet'in hesaplama parametreleriyle çalışır; resmi tablodan
 * sapması ölçtüğümüz illerde en fazla 2 dakikadır.
 */
export function fetchAladhanTimesByCoords(lat, lng) {
  return fetchCalendar(
    'calendar',
    `latitude=${lat}&longitude=${lng}`,
    `${lat.toFixed(2)},${lng.toFixed(2)}`
  );
}

/**
 * Aladhan takvimi ay bazlı döner. Ayın son günlerinde "sıradaki vakit" bir sonraki
 * aya taştığı için o günlerde ikinci ayı da çekiyoruz; ayın geri kalanında tek istek
 * yeterli (Aladhan'ın rate limit'ini gereksiz yormamak için).
 */
async function fetchCalendar(endpoint, params, cacheKey) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const ayınSonGünü = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ayaSonKalan = ayınSonGünü - now.getUTCDate();

  const aylar = [{ year, month }];
  if (ayaSonKalan <= 2) aylar.push(sonrakiAy(year, month));

  const sonuçlar = await Promise.all(
    aylar.map(({ year, month }) =>
      cached(`aladhan:${endpoint}:${cacheKey}:${year}-${month}`, 12 * HOUR, () =>
        getJson(`${BASE}/${endpoint}/${year}/${month}?${params}&method=${DIYANET_METHOD}`)
      )
    )
  );

  const günler = sonuçlar.flatMap((r) => r.data);

  return {
    source: 'aladhan',
    timezone: günler[0]?.meta?.timezone ?? 'UTC',
    days: günler.map((g) => ({
      date: toIsoDate(g.date.gregorian.date),
      times: {
        // Diyanet'in "İmsak"ı sabah namazının başlangıcıdır; Aladhan'ın Imsak alanı
        // bunun 10 dk öncesini (oruç ihtiyatı) verdiği için Fajr'ı kullanıyoruz.
        'İmsak': clean(g.timings.Fajr),
        'Güneş': clean(g.timings.Sunrise),
        'Öğle': clean(g.timings.Dhuhr),
        'İkindi': clean(g.timings.Asr),
        'Akşam': clean(g.timings.Maghrib),
        'Yatsı': clean(g.timings.Isha),
      },
    })),
  };
}

function sonrakiAy(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
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

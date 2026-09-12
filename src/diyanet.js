import { getJson } from './http.js';
import { cached, DAY, HOUR } from './cache.js';
import { matches, titleCase } from './text.js';

// Ayna adresi değişirse ortam değişkeniyle geçilebilsin.
const BASE = process.env.DIYANET_BASE || 'https://ezanvakti.emushaf.net';
const TURKIYE_ULKE_ID = '2';

/**
 * Diyanet'in resmi vakit tablolarını sunan açık API (ezanvakti.emushaf.net).
 * Koordinat kabul etmediği için il/ilçe adını ID'ye çevirip sorguluyoruz.
 */
export async function fetchDiyanetTimes({ il, ilce }) {
  const district = await resolveDistrict(il, ilce);
  if (!district) return null;

  return fetchTimesById(district.ilceId);
}

export async function fetchTimesById(ilceId) {
  const kayitlar = await cached(`diyanet:vakit:${ilceId}`, 12 * HOUR, () =>
    getJson(`${BASE}/vakitler/${ilceId}`)
  );

  return {
    source: 'diyanet',
    utcOffsetMinutes: Math.round((kayitlar[0]?.GreenwichOrtalamaZamani ?? 3) * 60),
    days: kayitlar.map((k) => ({
      date: toIsoDate(k.MiladiTarihKisa),
      times: {
        'İmsak': k.Imsak,
        'Güneş': k.Gunes,
        'Öğle': k.Ogle,
        'İkindi': k.Ikindi,
        'Akşam': k.Aksam,
        'Yatsı': k.Yatsi,
      },
    })),
  };
}

/**
 * İl adından SehirID, ilçe adından IlceID bulur; eşleşme yoksa null.
 * Diyanet'in kendi yazımını da döndürüyoruz: il/ilçe adıyla gelen isteklerde
 * ekranda gösterilecek adı buradan kuruyoruz, geocoding'e gerek kalmıyor.
 */
export async function resolveDistrict(il, ilce, { strict = false } = {}) {
  if (!il && !ilce) return null;

  const sehirler = await cached('diyanet:sehirler', 30 * DAY, () =>
    getJson(`${BASE}/sehirler/${TURKIYE_ULKE_ID}`)
  );

  // İl verilmediyse ilçe adını il gibi de deneyelim ("?il=Çorlu" yerine "?ilce=Çorlu").
  const aranan = il || ilce;
  const sehir = sehirler.find((s) => matches(s.SehirAdi, aranan) || matches(s.SehirAdiEn, aranan));
  if (!sehir) return null;

  const ilceler = await cached(`diyanet:ilceler:${sehir.SehirID}`, 30 * DAY, () =>
    getJson(`${BASE}/ilceler/${sehir.SehirID}`)
  );

  const tamEslesme = ilceler.find((i) => matches(i.IlceAdi, ilce) || matches(i.IlceAdiEn, ilce));

  // Kullanıcı açıkça bir ilçe yazdıysa ve Diyanet listesinde yoksa (ör. bir mahalle
  // adı) il merkezine düşmüyoruz: çağıran taraf koordinata çevirip daha yakın ilçeyi
  // bulabilir. Koordinattan gelen akışta ise merkeze düşmek doğru davranış.
  if (!tamEslesme && strict && ilce) return null;

  // İlçe adı bulunamazsa il merkezini (il ile aynı adlı ilçe) kullan,
  // o da yoksa listedeki ilk ilçeye düşmek yerine vazgeç.
  const bulunan =
    tamEslesme ??
    ilceler.find((i) => matches(i.IlceAdi, aranan) || matches(i.IlceAdiEn, aranan)) ??
    ilceler.find((i) => matches(i.IlceAdi, `${aranan} MERKEZ`));

  if (!bulunan) return null;

  const ilAdi = titleCase(sehir.SehirAdi);
  const ilceAdi = titleCase(bulunan.IlceAdi);

  return {
    ilceId: bulunan.IlceID,
    il: ilAdi,
    ilce: ilceAdi,
    countryCode: 'TR',
    displayName: buildDisplayName(ilceAdi, ilAdi),
  };
}

function buildDisplayName(ilce, il) {
  const unique = [...new Set([ilce, il].filter(Boolean))];
  return unique.join('/');
}

/** "29.07.2026" -> "2026-07-29" */
function toIsoDate(ddMMyyyy) {
  const [d, m, y] = ddMMyyyy.split('.');
  return `${y}-${m}-${d}`;
}

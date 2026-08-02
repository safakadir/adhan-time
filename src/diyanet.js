import { getJson } from './http.js';
import { cached, DAY, HOUR } from './cache.js';

// Ayna adresi değişirse ortam değişkeniyle geçilebilsin.
const BASE = process.env.DIYANET_BASE || 'https://ezanvakti.emushaf.net';
const TURKIYE_ULKE_ID = '2';

/**
 * Diyanet'in resmi vakit tablolarını sunan açık API (ezanvakti.emushaf.net).
 * Koordinat kabul etmediği için il/ilçe adını ID'ye çevirip sorguluyoruz.
 */
export async function fetchDiyanetTimes({ il, ilce }) {
  const ilceId = await findIlceId(il, ilce);
  if (!ilceId) return null;

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

/** İl adından SehirID, ilçe adından IlceID bulur; eşleşme yoksa null. */
async function findIlceId(il, ilce) {
  if (!il) return null;

  const sehirler = await cached('diyanet:sehirler', 30 * DAY, () =>
    getJson(`${BASE}/sehirler/${TURKIYE_ULKE_ID}`)
  );

  const sehir = sehirler.find((s) => matches(s.SehirAdi, il) || matches(s.SehirAdiEn, il));
  if (!sehir) return null;

  const ilceler = await cached(`diyanet:ilceler:${sehir.SehirID}`, 30 * DAY, () =>
    getJson(`${BASE}/ilceler/${sehir.SehirID}`)
  );

  // İlçe adı bulunamazsa il merkezini (il ile aynı adlı ilçe) kullan,
  // o da yoksa listedeki ilk ilçeye düşmek yerine vazgeç.
  const bulunan =
    ilceler.find((i) => matches(i.IlceAdi, ilce) || matches(i.IlceAdiEn, ilce)) ??
    ilceler.find((i) => matches(i.IlceAdi, il) || matches(i.IlceAdiEn, il)) ??
    ilceler.find((i) => matches(i.IlceAdi, `${il} MERKEZ`));

  return bulunan?.IlceID ?? null;
}

/**
 * Türkçe yer adlarını karşılaştırır: aksan, büyük/küçük harf ve
 * "İ/I", "ı/i" farkları API'ler arasında tutarsız olduğu için hepsini sadeleştiriyoruz.
 */
function matches(a, b) {
  return a != null && b != null && normalize(a) === normalize(b);
}

function normalize(value) {
  return String(value)
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .replaceAll('İ', 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** "29.07.2026" -> "2026-07-29" */
function toIsoDate(ddMMyyyy) {
  const [d, m, y] = ddMMyyyy.split('.');
  return `${y}-${m}-${d}`;
}

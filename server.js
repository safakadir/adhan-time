import express from 'express';
import { reverseGeocode } from './src/geo.js';
import { fetchDiyanetTimes } from './src/diyanet.js';
import { fetchAladhanTimes } from './src/aladhan.js';
import { evaluate } from './src/prayer.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.type('text/plain').send(
    [
      'Namaz Vakti API',
      '',
      'GET /vakit?lat=36.2694&lng=32.3183',
      'GET /vakit?il=Antalya&ilce=Gazipasa',
      '',
      'Ek parametre: &format=text  -> sadece displayText satirini dondurur',
    ].join('\n')
  );
});

app.get('/vakit', async (req, res) => {
  const wantsText = req.query.format === 'text';

  try {
    const { schedule, location } = await resolveSchedule(req.query);
    const result = evaluate(schedule, { location });

    if (wantsText) return res.type('text/plain; charset=utf-8').send(result.displayText);
    res.json(result);
  } catch (err) {
    const status = err.status ?? 502;
    const displayText = `Namaz vakti alınamadı: ${err.message}`;

    if (wantsText) return res.status(status).type('text/plain; charset=utf-8').send(displayText);
    res.status(status).json({ ok: false, displayText, error: err.message });
  }
});

/**
 * Konumu vakit tablosuna çevirir. Öncelik Diyanet'in resmi tablosunda;
 * ilçe eşleşmezse veya konum yurt dışıysa hesaplama tabanlı kaynağa düşer.
 */
async function resolveSchedule(query) {
  const { lat, lng } = parseCoords(query);

  if (lat != null) {
    const place = await reverseGeocode(lat, lng);

    if (place.countryCode === 'TR') {
      const schedule = await fetchDiyanetTimes(place);
      if (schedule) return { schedule, location: place.displayName };
    }

    return { schedule: await fetchAladhanTimes(lat, lng), location: place.displayName };
  }

  const il = str(query.il);
  const ilce = str(query.ilce);

  if (!il) {
    throw badRequest('lat & lng ya da il (ve tercihen ilce) parametresi gerekli');
  }

  const schedule = await fetchDiyanetTimes({ il, ilce });
  if (!schedule) {
    throw badRequest(`Diyanet listesinde "${[ilce, il].filter(Boolean).join('/')}" bulunamadı`);
  }

  return { schedule, location: [ilce, il].filter(Boolean).join('/') };
}

function parseCoords(query) {
  const lat = num(query.lat);
  const lng = num(query.lng ?? query.lon ?? query.long);

  if (lat == null && lng == null) return { lat: null, lng: null };

  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw badRequest('Geçersiz lat/lng değeri');
  }
  return { lat, lng };
}

/** Kestirmeler bazı bölgesel ayarlarda ondalık ayırıcı olarak virgül gönderiyor. */
function num(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

app.listen(PORT, () => {
  console.log(`Namaz vakti API çalışıyor: http://localhost:${PORT}`);
});

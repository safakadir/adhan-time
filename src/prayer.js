const ORDER = ['İmsak', 'Güneş', 'Öğle', 'İkindi', 'Akşam', 'Yatsı'];

/**
 * Vakit tablosundan "şu an hangi vakitteyiz / sıradaki vakit ne zaman" bilgisini çıkarır.
 * Tablodaki saatler konumun yerel saati olduğu için önce hepsini epoch'a çeviriyoruz.
 */
export function evaluate(schedule, { now = Date.now(), location } = {}) {
  const offsetMinutes = resolveOffset(schedule, now);
  const timeline = buildTimeline(schedule, offsetMinutes);

  const nextIndex = timeline.findIndex((entry) => entry.at > now);
  if (nextIndex === -1) {
    throw new Error('Vakit tablosu güncel değil, sıradaki vakit bulunamadı');
  }

  const next = timeline[nextIndex];
  const current = timeline[nextIndex - 1] ?? null;

  const remainingMinutes = Math.ceil((next.at - now) / 60000);
  const remainingText = formatRemaining(remainingMinutes);
  const remainingPhrase = remainingMinutes <= 0 ? remainingText : `${remainingText} sonra`;

  const today = todayIso(now, offsetMinutes);
  const todaysTimes = schedule.days.find((d) => d.date === today)?.times ?? null;

  return {
    ok: true,
    displayText: `Sonraki vakit: ${next.name}, ${remainingPhrase} - ${location}`,
    currentPrayer: current?.name ?? null,
    nextPrayer: next.name,
    nextPrayerTime: next.time,
    nextPrayerDate: next.date,
    remaining: remainingText,
    remainingMinutes,
    location,
    date: today,
    times: todaysTimes,
    source: schedule.source,
  };
}

/** Tüm günlerin vakitlerini kronolojik tek listeye açar. */
function buildTimeline(schedule, offsetMinutes) {
  const entries = [];

  for (const day of schedule.days) {
    for (const name of ORDER) {
      const time = day.times[name];
      if (!time) continue;
      entries.push({ name, time, date: day.date, at: toEpoch(day.date, time, offsetMinutes) });
    }
  }

  return entries.sort((a, b) => a.at - b.at);
}

function toEpoch(isoDate, hhmm, offsetMinutes) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - offsetMinutes * 60000;
}

/** Diyanet kaynağı hazır offset verir; Aladhan IANA saat dilimi verdiği için çeviriyoruz. */
function resolveOffset(schedule, now) {
  if (typeof schedule.utcOffsetMinutes === 'number') return schedule.utcOffsetMinutes;

  const date = new Date(now);
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(date.toLocaleString('en-US', { timeZone: schedule.timezone }));
  return Math.round((local - utc) / 60000);
}

function todayIso(now, offsetMinutes) {
  return new Date(now + offsetMinutes * 60000).toISOString().slice(0, 10);
}

function formatRemaining(minutes) {
  if (minutes <= 0) return 'az sonra';

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}dk`;
  if (mins === 0) return `${hours}sa`;
  return `${hours}sa ${mins}dk`;
}

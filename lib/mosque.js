/**
 * Masjid Zeenatul Islam, Coventry.
 *
 * The mosque publishes its own timetable (beginning time and jamaat) and
 * serves it as JSON from the website. That is the default for this app.
 * Aladhan is only used when you ask for calculated times somewhere else.
 *
 * https://masjidzeenatulislam.org.uk
 * API: /wp-json/dpt/v1/prayertime?filter=year
 *
 * Their sheet has two Asr columns (mithl 1 and mithl 2). Both currently hold
 * the same clock time, which matches the single Asr on the printed timetable.
 */

export const MOSQUE = Object.freeze({
  name: 'Masjid Zeenatul Islam',
  url: 'https://masjidzeenatulislam.org.uk',
  address: 'Stoney Stanton Road, Coventry',
  latitude: 52.4189442,
  longitude: -1.4984685,
  timeZone: 'Europe/London',
});

const PRAYER_FIELDS = [
  { name: 'Fajr', begins: 'fajr_begins', jamah: 'fajr_jamah' },
  { name: 'Dhuhr', begins: 'zuhr_begins', jamah: 'zuhr_jamah' },
  { name: 'Asr', begins: 'asr_mithl_2', jamah: 'asr_jamah' },
  { name: 'Maghrib', begins: 'maghrib_begins', jamah: 'maghrib_jamah' },
  { name: 'Isha', begins: 'isha_begins', jamah: 'isha_jamah' },
];

export function prayerTimeUrl(filter) {
  return `${MOSQUE.url}/wp-json/dpt/v1/prayertime?filter=${filter}`;
}

/** "05:39:00" -> "05:39". Returns null when the cell is empty. */
export function clockFromApi(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function minutesFromClock(clock) {
  if (!clock) return NaN;
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 2026-11-13 is a Friday. Noon UTC avoids any local-timezone shift. */
export function isFridayIso(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  if (!year || !month || !day) return false;
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() === 5;
}

export function jamahLabel(day, prayerName) {
  if (prayerName === 'Dhuhr' && day.isFriday) return "Jumu'ah";
  return `${prayerName} jamaat`;
}

/**
 * One row from the mosque API, reshaped into the fields the page renders.
 * `date.gregorian.date` stays DD-MM-YYYY so it matches the Aladhan days.
 */
export function normalizeMosqueDay(row) {
  const isoDate = row.d_date;
  const [year, month, day] = isoDate.split('-');
  const noon = new Date(`${isoDate}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(noon);
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(noon);
  const asr = clockFromApi(row.asr_mithl_2) || clockFromApi(row.asr_mithl_1);
  const hijri = row.hijri_date_convert;
  const dayRecord = {
    source: 'mosque',
    isoDate,
    isFriday: isFridayIso(isoDate),
    hijriLabel: hijri && hijri !== '0' ? hijri : '',
    date: {
      gregorian: {
        date: `${day}-${month}-${year}`,
        day,
        month: { en: monthName },
        weekday: { en: weekday },
        year,
      },
    },
    timings: {
      Fajr: clockFromApi(row.fajr_begins),
      Sunrise: clockFromApi(row.sunrise),
      Dhuhr: clockFromApi(row.zuhr_begins),
      Asr: asr,
      Maghrib: clockFromApi(row.maghrib_begins),
      Isha: clockFromApi(row.isha_begins),
    },
    jamah: {
      Fajr: clockFromApi(row.fajr_jamah),
      Dhuhr: clockFromApi(row.zuhr_jamah),
      Asr: clockFromApi(row.asr_jamah),
      Maghrib: clockFromApi(row.maghrib_jamah),
      Isha: clockFromApi(row.isha_jamah),
    },
  };
  return dayRecord;
}

/** Year and month responses are wrapped in an extra array. Today is a one-element array. */
export function unwrapMosqueDays(payload) {
  if (!Array.isArray(payload)) return [];
  const rows = Array.isArray(payload[0]) ? payload[0] : payload;
  return rows
    .filter((row) => row && row.d_date)
    .map(normalizeMosqueDay)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

/** Copy the Hijri label from the "today" response onto the matching day. */
export function attachHijri(days, todayPayload) {
  const row = Array.isArray(todayPayload) ? todayPayload[0] : null;
  const label = row && row.hijri_date_convert;
  if (!row || !label || label === '0') return days;
  return days.map((day) => (day.isoDate === row.d_date ? { ...day, hijriLabel: label } : day));
}

/**
 * Beginning time, then jamaat, for one day.
 * Maghrib jamaat is the same minute as Maghrib begins, so it is not listed twice.
 */
export function momentsOnDay(day, isTomorrow = false) {
  if (!day) return [];
  const moments = [];
  for (const prayer of PRAYER_FIELDS) {
    const beginsClock = day.timings[prayer.name];
    const jamahClock = day.jamah[prayer.name];
    const begins = minutesFromClock(beginsClock);
    const jamah = minutesFromClock(jamahClock);
    if (Number.isFinite(begins)) {
      moments.push({
        name: prayer.name,
        kind: 'begins',
        label: prayer.name,
        atMinutes: begins,
        isTomorrow,
        beginsClock,
        jamahClock,
      });
    }
    if (Number.isFinite(jamah) && jamah !== begins) {
      moments.push({
        name: prayer.name,
        kind: 'jamah',
        label: jamahLabel(day, prayer.name),
        atMinutes: jamah,
        isTomorrow,
        beginsClock,
        jamahClock,
      });
    }
  }
  return moments;
}

/**
 * The next thing on the mosque timetable.
 * Before Fajr begins, that is Fajr. After Fajr has started, it is Fajr jamaat.
 * After Isha jamaat, it is tomorrow's Fajr.
 */
export function nextMosqueMoment(today, tomorrow, nowMinutes) {
  const todayMoments = momentsOnDay(today, false);
  const nextToday = todayMoments.find((moment) => nowMinutes < moment.atMinutes);
  if (nextToday) return nextToday;

  const tomorrowMoments = momentsOnDay(tomorrow, true);
  if (tomorrowMoments.length > 0) return tomorrowMoments[0];

  const fajr = minutesFromClock(today && today.timings.Fajr);
  return {
    name: 'Fajr',
    kind: 'begins',
    label: 'Fajr',
    atMinutes: fajr,
    isTomorrow: true,
    beginsClock: today && today.timings.Fajr,
    jamahClock: today && today.jamah.Fajr,
  };
}

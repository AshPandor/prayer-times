/**
 * The two mosques this app follows.
 *
 * Zeenatul Islam in Coventry is home. Masjid-e-Umar in Darlaston is used when
 * the phone is in that area (Darlaston and Wednesbury, WS10). Both publish
 * their own beginning times and jamaat. Aladhan is only for calculated times
 * somewhere else.
 *
 * Zeenatul Islam: https://masjidzeenatulislam.org.uk
 *   /wp-json/dpt/v1/prayertime?filter=year
 *   Two Asr columns (mithl 1 and mithl 2) currently hold the same clock time.
 *
 * Masjid-e-Umar: https://masjid-e-umar.co.uk
 *   The daily board is served by go2masjid. We only keep the prayer rows.
 *   That response also contains bank details, which this file never reads.
 */

export const MOSQUE = Object.freeze({
  id: 'zeenatul',
  name: 'Masjid Zeenatul Islam',
  url: 'https://masjidzeenatulislam.org.uk',
  address: 'Stoney Stanton Road, Coventry',
  latitude: 52.4189442,
  longitude: -1.4984685,
  timeZone: 'Europe/London',
});

export const UMAR = Object.freeze({
  id: 'umar',
  name: 'Masjid-e-Umar',
  url: 'https://masjid-e-umar.co.uk',
  address: 'Bills Street, Darlaston',
  latitude: 52.569604,
  longitude: -2.026243,
  timeZone: 'Europe/London',
  // Darlaston is under 1 km away and Wednesbury about 2 km. Walsall town is
  // further out, and Coventry is about 40 km, so this circle is the WS10 area.
  radiusKm: 6,
  fridayNote: "First Jumu'ah khutbah is 12:35. Second khutbah is 13:30.",
});

export function mosqueById(id) {
  if (id === 'umar') return UMAR;
  return MOSQUE;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Distance in kilometres between two latitude/longitude points. */
export function distanceKm(fromLat, fromLon, toLat, toLon) {
  const earthKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

/**
 * Masjid-e-Umar when the phone is in Darlaston or Wednesbury.
 * Anywhere else, Zeenatul Islam.
 */
export function mosqueForCoordinates(latitude, longitude) {
  const distance = distanceKm(latitude, longitude, UMAR.latitude, UMAR.longitude);
  if (distance <= UMAR.radiusKm) return UMAR;
  return MOSQUE;
}

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

/** About three months of Masjid-e-Umar rows. A full year is not on this feed. */
export function umarTimetableUrl() {
  return 'https://go2masjid.com/api/papi/loc_getfavmasjid.php?lat=0&lon=0&dist=1&mlim=1&slim=90&mid=wals_234_';
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

/**
 * One go2masjid row, reshaped into the same fields as a Zeenatul Islam day.
 * Maghrib is a single clock time, so begins and jamaat match.
 */
export function normalizeUmarDay(row) {
  const isoDate = row.salatdate;
  const base = normalizeMosqueDay({
    d_date: isoDate,
    fajr_begins: row.fajarstart,
    fajr_jamah: row.fajarjamat,
    sunrise: row.sunrise,
    zuhr_begins: row.zuhrstart,
    zuhr_jamah: row.zuhrjamat,
    asr_mithl_2: row.asarstart,
    asr_jamah: row.asarjamat,
    maghrib_begins: row.maghrib,
    maghrib_jamah: row.maghrib,
    isha_begins: row.eshastart,
    isha_jamah: row.eshajamat,
  });
  return base;
}

/** The useful part of the go2masjid response. Bank fields on the parent object are ignored. */
export function unwrapUmarDays(payload) {
  const mosque = Array.isArray(payload) ? payload[0] : payload;
  const rows = mosque && mosque.salats;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && row.salatdate)
    .map(normalizeUmarDay)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
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

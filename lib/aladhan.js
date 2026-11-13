/**
 * Aladhan prayer-times API.
 *
 * Docs: https://aladhan.com/prayer-times-api
 *
 * We ask for a whole month (`/v1/calendar/...`) and store it on the phone.
 * Tomorrow's Fajr, and the rest of an offline day, are then already here.
 * `method` chooses the Fajr/Isha angles. `school` chooses Asr:
 *   0 = Standard (Shafi, Maliki, Hanbali) — shadow ratio 1
 *   1 = Hanafi — shadow ratio 2, so Asr is later
 */

export const CALCULATION_METHODS = Object.freeze([
  { id: 15, name: 'Moonsighting Committee' },
  { id: 3, name: 'Muslim World League' },
  { id: 2, name: 'Islamic Society of North America (ISNA)' },
  { id: 5, name: 'Egyptian General Authority' },
  { id: 4, name: 'Umm Al-Qura, Makkah' },
  { id: 1, name: 'University of Islamic Sciences, Karachi' },
  { id: 13, name: 'Diyanet, Turkey' },
  { id: 12, name: 'UOIF, France' },
  { id: 16, name: 'Dubai' },
  { id: 9, name: 'Kuwait' },
  { id: 10, name: 'Qatar' },
  { id: 11, name: 'Singapore' },
]);

export const ASR_SCHOOLS = Object.freeze([
  { id: 1, name: 'Hanafi' },
  { id: 0, name: 'Standard (Shafi, Maliki, Hanbali)' },
]);

/** Moonsighting Committee. It was put together with higher latitudes, including the UK, in mind. */
export const DEFAULT_METHOD = 15;

/** Hanafi is the common Asr in much of the UK. It is still a setting. */
export const DEFAULT_SCHOOL = 1;

export function methodById(id) {
  return CALCULATION_METHODS.find((method) => method.id === Number(id)) || null;
}

export function calendarUrl({ latitude, longitude, year, month, method, school }) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    method: String(method),
    school: String(school),
  });
  return `https://api.aladhan.com/v1/calendar/${year}/${month}?${params}`;
}

/**
 * A saved month is reusable when it is the same method, Asr school, and month,
 * and the coordinates are within about 5 km. GPS wobbles by less than that,
 * so we do not throw away a download because the third decimal moved.
 */
export function monthRecordMatches(record, query) {
  if (!record || !Array.isArray(record.days) || record.days.length === 0) return false;
  if (Number(record.method) !== Number(query.method)) return false;
  if (Number(record.school) !== Number(query.school)) return false;
  if (Number(record.year) !== Number(query.year)) return false;
  if (Number(record.month) !== Number(query.month)) return false;

  const distance = Math.hypot(
    Number(record.latitude) - Number(query.latitude),
    Number(record.longitude) - Number(query.longitude),
  );
  return distance <= 0.05;
}

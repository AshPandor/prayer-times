/**
 * Turning a city name into coordinates.
 *
 * Browser geolocation is the first choice. If permission is denied we still
 * need a latitude and longitude, because the Qibla formula and the prayer-time
 * request both use one. Open-Meteo's geocoding API is free, needs no key, and
 * allows browser requests.
 *
 * We do not read coordinates from Aladhan's city endpoint. As of 2026 that
 * endpoint returns the right times and timezone, but a placeholder latitude
 * and longitude (8.8888888, 7.7777777). Using those would point the Qibla at
 * the wrong country.
 */

export const DEFAULT_PLACE = Object.freeze({
  city: 'Coventry',
  region: 'England',
  country: 'United Kingdom',
  countryCode: 'GB',
  latitude: 52.40656,
  longitude: -1.51217,
  timeZone: 'Europe/London',
  label: 'Coventry, England',
});

const COUNTRY_ALIASES = new Map([
  ['uk', 'united kingdom'],
  ['u.k.', 'united kingdom'],
  ['gb', 'united kingdom'],
  ['great britain', 'united kingdom'],
  ['britain', 'united kingdom'],
  ['england', 'united kingdom'],
  ['scotland', 'united kingdom'],
  ['wales', 'united kingdom'],
  ['usa', 'united states'],
  ['us', 'united states'],
  ['u.s.', 'united states'],
  ['u.s.a.', 'united states'],
  ['america', 'united states'],
]);

export function normalizeCountry(value) {
  const text = String(value || '').trim().toLowerCase();
  return COUNTRY_ALIASES.get(text) || text;
}

/** Search URL. `name` is the city only; the country is filtered afterwards. */
export function geocodingUrl(name) {
  const params = new URLSearchParams({
    name: String(name || '').trim(),
    count: '5',
    language: 'en',
    format: 'json',
  });
  return `https://geocoding-api.open-meteo.com/v1/search?${params}`;
}

export function placeMatchesCountry(row, country) {
  const wanted = normalizeCountry(country);
  if (!wanted) return true;

  const fields = [row.country, row.country_code, row.admin1]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  if (wanted === 'united kingdom') {
    return fields.some((field) => field === 'united kingdom' || field === 'gb' || field === 'england');
  }
  if (wanted === 'united states') {
    return fields.some((field) => field === 'united states' || field === 'us');
  }
  return fields.some((field) => field === wanted || field.includes(wanted) || wanted.includes(field));
}

export function toPlace(row) {
  return {
    city: row.name,
    region: row.admin1 || '',
    country: row.country || '',
    countryCode: row.country_code || '',
    latitude: row.latitude,
    longitude: row.longitude,
    timeZone: row.timezone || 'UTC',
    label: [row.name, row.admin1].filter(Boolean).join(', '),
  };
}

/**
 * Pick the row the user meant. If they typed a country and nothing matches,
 * return null instead of silently using a different Coventry.
 */
export function pickPlace(results, { country } = {}) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const wanted = String(country || '').trim();
  const matching = wanted ? results.filter((row) => placeMatchesCountry(row, wanted)) : results;
  if (matching.length === 0) return null;
  return toPlace(matching[0]);
}

/** True when the saved geocode was for the city and country currently typed. */
export function sameSavedPlace(saved, city, country) {
  if (!saved) return false;
  const sameCity =
    String(saved.queryCity || saved.city || '').trim().toLowerCase() ===
    String(city || '').trim().toLowerCase();
  if (!sameCity) return false;
  return normalizeCountry(saved.queryCountry || saved.country) === normalizeCountry(country);
}

/** The built-in Coventry coordinates, used when geocoding itself is offline. */
export function isDefaultCoventry(city, country) {
  if (String(city || '').trim().toLowerCase() !== 'coventry') return false;
  if (!String(country || '').trim()) return true;
  return placeMatchesCountry(
    { country: 'United Kingdom', country_code: 'GB', admin1: 'England' },
    country,
  );
}

export function formatCoords(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  const northSouth = latitude >= 0 ? 'N' : 'S';
  const eastWest = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(2)}°${northSouth}, ${Math.abs(longitude).toFixed(2)}°${eastWest}`;
}

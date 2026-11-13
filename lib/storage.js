/**
 * localStorage holds strings only, so every value is JSON.
 *
 * Settings (method, city, reminder toggle) and the downloaded month are
 * separate keys. Changing a setting should not wipe the saved timetable,
 * and a huge month should not sit inside the settings object.
 *
 * Private-browsing modes sometimes throw when you write storage. We catch
 * that and carry on with the in-memory values for this visit.
 */

export const SETTINGS_KEY = 'prayer-times-settings';
export const MONTH_KEY = 'prayer-times-month';

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

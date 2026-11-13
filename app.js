/**
 * Prayer Times & Qibla — the page controller.
 *
 * index.html is the skeleton. This file fills it in. The maths lives in lib/
 * so it can be tested with `node --test` and does not need a phone.
 *
 * Order of work on each load:
 *   1. Read settings from localStorage.
 *   2. Find coordinates (GPS, or a city name, or the saved Coventry point).
 *   3. Download this month from Aladhan, or use the saved month if we are offline.
 *   4. Paint the next prayer, the list, and the Qibla.
 *   5. Tick the countdown once a second.
 */

import {
  calendarUrl,
  methodById,
  monthRecordMatches,
  CALCULATION_METHODS,
  ASR_SCHOOLS,
  DEFAULT_METHOD,
  DEFAULT_SCHOOL,
} from './lib/aladhan.js';
import {
  DEFAULT_PLACE,
  formatCoords,
  geocodingUrl,
  isDefaultCoventry,
  pickPlace,
  sameSavedPlace,
} from './lib/places.js';
import {
  PRAYER_NAMES,
  civilYearMonth,
  describeCountdown,
  formatClock,
  formatCountdown,
  parseTimeToMinutes,
  resolveNextPrayer,
  zonedParts,
  zonedWallTimeToDate,
} from './lib/prayer.js';
import {
  compassHeadingFromEvent,
  formatBearing,
  needleRotation,
  qiblaBearing,
  smoothHeading,
} from './lib/qibla.js';
import { MONTH_KEY, SETTINGS_KEY, loadJson, saveJson } from './lib/storage.js';

const ROWS = [
  { key: 'Fajr', label: 'Fajr' },
  { key: 'Sunrise', label: 'Sunrise', sun: true },
  { key: 'Dhuhr', label: 'Dhuhr' },
  { key: 'Asr', label: 'Asr' },
  { key: 'Maghrib', label: 'Maghrib' },
  { key: 'Isha', label: 'Isha' },
];

const state = {
  settings: null,
  place: null,
  timeZone: 'Europe/London',
  today: null,
  tomorrow: null,
  source: null,
  loading: false,
  error: '',
  usingCityFallback: false,
  geoMessage: '',
  next: null,
  listKey: '',
  titleKey: '',
  spokenKey: '',
  heading: null,
  compassMode: 'unavailable',
};

let requestSeq = 0;
let reminderTimers = [];
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = {
  locationName: document.querySelector('#location-name'),
  locationDetail: document.querySelector('#location-detail'),
  dateLine: document.querySelector('#date-line'),
  banners: document.querySelector('#banners'),
  retry: document.querySelector('#retry-button'),
  nextName: document.querySelector('#next-name'),
  countdown: document.querySelector('#countdown'),
  countdownSpoken: document.querySelector('#countdown-spoken'),
  prayerList: document.querySelector('#prayer-list'),
  methodLine: document.querySelector('#method-line'),
  qiblaReadout: document.querySelector('#qibla-readout'),
  qiblaHelp: document.querySelector('#qibla-help'),
  compassRose: document.querySelector('#compass-rose'),
  qiblaNeedle: document.querySelector('#qibla-needle'),
  lubber: document.querySelector('#lubber'),
  compassButton: document.querySelector('#compass-button'),
  form: document.querySelector('#settings-form'),
  method: document.querySelector('#method'),
  school: document.querySelector('#school'),
  city: document.querySelector('#city'),
  country: document.querySelector('#country'),
  useCity: document.querySelector('#use-city'),
  useGps: document.querySelector('#use-gps'),
  reminders: document.querySelector('#reminders'),
  reminderMinutes: document.querySelector('#reminder-minutes'),
  reminderNote: document.querySelector('#reminder-note'),
  installHelp: document.querySelector('#install-help'),
  installButton: document.querySelector('#install-button'),
};

function loadAppSettings() {
  const saved = loadJson(SETTINGS_KEY, {});
  const method = Number(saved.method);
  const school = Number(saved.school);
  const minutes = Number(saved.reminderMinutes);
  return {
    method: CALCULATION_METHODS.some((item) => item.id === method) ? method : DEFAULT_METHOD,
    school: school === 0 || school === 1 ? school : DEFAULT_SCHOOL,
    city: typeof saved.city === 'string' && saved.city.trim() ? saved.city.trim() : DEFAULT_PLACE.city,
    country:
      typeof saved.country === 'string' && saved.country.trim()
        ? saved.country.trim()
        : DEFAULT_PLACE.country,
    locationMode: saved.locationMode === 'city' ? 'city' : 'auto',
    remindersEnabled: saved.remindersEnabled === true,
    reminderMinutes: Number.isFinite(minutes) ? Math.min(90, Math.max(0, Math.round(minutes))) : 10,
    savedPlace: saved.savedPlace && typeof saved.savedPlace === 'object' ? saved.savedPlace : null,
  };
}

function persistSettings() {
  saveJson(SETTINGS_KEY, state.settings);
}

function fillSelect(select, options) {
  select.replaceChildren();
  for (const optionInfo of options) {
    const option = document.createElement('option');
    option.value = String(optionInfo.id);
    option.textContent = optionInfo.name;
    select.append(option);
  }
}

function applySettingsToForm() {
  el.method.value = String(state.settings.method);
  el.school.value = String(state.settings.school);
  el.city.value = state.settings.city;
  el.country.value = state.settings.country;
  el.reminderMinutes.value = String(state.settings.reminderMinutes);

  const notificationsOk =
    'Notification' in window && Notification.permission === 'granted' && state.settings.remindersEnabled;
  el.reminders.checked = notificationsOk;
  if (state.settings.remindersEnabled && !notificationsOk) {
    // The toggle was on, but this browser is not actually allowed to notify.
    // Leave it off until the user taps it again (that tap is what may ask).
    state.settings.remindersEnabled = false;
    persistSettings();
  }
  updateReminderNote();
}

function updateReminderNote() {
  if (!('Notification' in window)) {
    el.reminderNote.textContent = 'This browser cannot show notifications.';
    el.reminders.disabled = true;
    return;
  }
  if (Notification.permission === 'denied') {
    el.reminderNote.textContent =
      'Notifications are blocked for this site. You can allow them from the phone’s site settings.';
  }
}

function bindForm() {
  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    el.useCity.click();
  });

  el.method.addEventListener('change', () => {
    state.settings.method = Number(el.method.value);
    persistSettings();
    refresh();
  });

  el.school.addEventListener('change', () => {
    state.settings.school = Number(el.school.value);
    persistSettings();
    refresh();
  });

  el.useCity.addEventListener('click', () => {
    const city = el.city.value.trim();
    const country = el.country.value.trim();
    state.settings.city = city || DEFAULT_PLACE.city;
    state.settings.country = country || DEFAULT_PLACE.country;
    el.city.value = state.settings.city;
    el.country.value = state.settings.country;
    state.settings.locationMode = 'city';
    persistSettings();
    refresh();
  });

  el.useGps.addEventListener('click', () => {
    state.settings.locationMode = 'auto';
    persistSettings();
    refresh();
  });

  el.reminders.addEventListener('change', () => {
    toggleReminders();
  });

  el.reminderMinutes.addEventListener('change', () => {
    let value = Number(el.reminderMinutes.value);
    if (!Number.isFinite(value)) value = 10;
    value = Math.min(90, Math.max(0, Math.round(value)));
    el.reminderMinutes.value = String(value);
    state.settings.reminderMinutes = value;
    persistSettings();
    scheduleReminders();
  });
}

async function toggleReminders() {
  if (!el.reminders.checked) {
    state.settings.remindersEnabled = false;
    persistSettings();
    scheduleReminders();
    updateReminderNote();
    return;
  }

  // requestPermission has to run inside the tap that flipped the switch.
  // Moving it to a timer makes iOS reject it.
  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = 'denied';
    }
  }

  if (permission !== 'granted') {
    el.reminders.checked = false;
    state.settings.remindersEnabled = false;
    persistSettings();
    updateReminderNote();
    return;
  }

  state.settings.remindersEnabled = true;
  persistSettings();
  updateReminderNote();
  scheduleReminders();
}

function requestPosition() {
  if (!('geolocation' in navigator)) {
    return Promise.reject(Object.assign(new Error('This browser has no location service.'), { code: 0 }));
  }
  return new Promise((resolve, reject) => {
    // enableHighAccuracy is left off on purpose. Prayer times are the same
    // across a neighbourhood, and a rough fix is kinder to the battery.
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 10 * 60 * 1000,
    });
  });
}

function geoErrorMessage(error) {
  if (error && error.code === 1) return 'Location permission was blocked.';
  if (error && error.code === 2) return 'Your location could not be found.';
  if (error && error.code === 3) return 'Finding your location took too long.';
  return 'Location is unavailable.';
}

async function resolveCoordinates() {
  state.usingCityFallback = false;
  state.geoMessage = '';

  if (state.settings.locationMode !== 'city') {
    try {
      const position = await requestPosition();
      state.place = {
        source: 'gps',
        label: 'Current location',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
      };
      return;
    } catch (error) {
      state.usingCityFallback = true;
      state.geoMessage = geoErrorMessage(error);
    }
  }

  const city = state.settings.city;
  const country = state.settings.country;
  const saved = state.settings.savedPlace;

  try {
    const response = await fetch(geocodingUrl(city), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`City search failed (${response.status}).`);
    const body = await response.json();
    const place = pickPlace(body.results, { country });
    if (!place) {
      throw new Error(`No match for ${city}${country ? `, ${country}` : ''}. Try a fuller country name.`);
    }
    state.settings.savedPlace = { queryCity: city, queryCountry: country, ...place };
    persistSettings();
    state.place = { source: 'city', ...place };
  } catch (error) {
    if (saved && sameSavedPlace(saved, city, country)) {
      state.place = { source: 'city', ...saved };
      return;
    }
    if (isDefaultCoventry(city, country)) {
      // Geocoding failed, but we know Coventry. Times may still come from cache.
      state.place = { source: 'city', ...DEFAULT_PLACE };
      return;
    }
    throw error;
  }
}

async function fetchMonth(query) {
  const response = await fetch(calendarUrl(query), { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Aladhan replied with ${response.status}.`);
  const body = await response.json();
  if (!body || body.code !== 200 || !Array.isArray(body.data)) {
    const detail = body && typeof body.data === 'string' ? body.data : 'Unexpected reply from Aladhan.';
    throw new Error(detail);
  }
  return body.data;
}

function couldNotDownloadMessage() {
  if (!navigator.onLine) {
    return 'You are offline, and there are no saved times for this place yet. Connect once to download the month.';
  }
  return 'Could not download prayer times, and there are no saved times for this place yet.';
}

async function loadMonth() {
  const place = state.place;
  let timeZone = place.timeZone || state.timeZone || 'Europe/London';
  let { year, month } = civilYearMonth(new Date(), timeZone);

  const baseQuery = {
    latitude: place.latitude,
    longitude: place.longitude,
    method: state.settings.method,
    school: state.settings.school,
  };

  let query = { ...baseQuery, year, month };
  let record = null;
  let source = 'network';

  try {
    const days = await fetchMonth(query);
    record = { ...query, days, savedAt: Date.now() };
    saveJson(MONTH_KEY, record);
  } catch {
    const cached = loadJson(MONTH_KEY, null);
    if (!monthRecordMatches(cached, query)) {
      // Drop any timetable already on screen so a failed city change cannot
      // keep showing the previous city's prayers under the new name.
      state.today = null;
      state.tomorrow = null;
      state.source = null;
      throw new Error(couldNotDownloadMessage());
    }
    record = cached;
    source = 'cache';
  }

  const metaZone = record.days[0] && record.days[0].meta && record.days[0].meta.timezone;
  if (metaZone) timeZone = metaZone;
  state.timeZone = timeZone;

  // The phone and the place can disagree about the date near midnight, or
  // when the phone is still on last month. Ask again for the place's month.
  const todayKey = zonedParts(new Date(), timeZone).dateKey;
  const hasToday = record.days.some((day) => day.date && day.date.gregorian && day.date.gregorian.date === todayKey);
  if (!hasToday) {
    const again = civilYearMonth(new Date(), timeZone);
    if (again.year !== year || again.month !== month) {
      query = { ...baseQuery, year: again.year, month: again.month };
      try {
        const days = await fetchMonth(query);
        record = { ...query, days, savedAt: Date.now() };
        saveJson(MONTH_KEY, record);
        source = 'network';
      } catch {
        const cached = loadJson(MONTH_KEY, null);
        if (monthRecordMatches(cached, query)) {
          record = cached;
          source = 'cache';
        }
      }
    }
  }

  const keyNow = zonedParts(new Date(), state.timeZone).dateKey;
  state.today =
    record.days.find((day) => day.date && day.date.gregorian && day.date.gregorian.date === keyNow) || null;
  if (!state.today) {
    throw new Error('Saved times do not include today. Connect to the internet to download this month.');
  }
  const index = record.days.indexOf(state.today);
  state.tomorrow = record.days[index + 1] || null;
  state.source = source;
  state.listKey = '';
}

async function refresh() {
  const seq = ++requestSeq;
  state.loading = true;
  state.error = '';
  render();

  try {
    await resolveCoordinates();
    if (seq !== requestSeq) return;
    render();
    await loadMonth();
    if (seq !== requestSeq) return;
    state.error = '';
  } catch (error) {
    if (seq !== requestSeq) return;
    state.error = (error && error.message) || 'Something went wrong.';
  } finally {
    if (seq === requestSeq) {
      state.loading = false;
      render();
      scheduleReminders();
    }
  }
}

function render() {
  renderHeader();
  renderStatus();
  renderMethodLine();
  renderPrayerList();
  renderCountdown();
  renderCompass();
}

function renderHeader() {
  if (!state.place) {
    el.locationName.textContent = 'Finding your location…';
    el.locationDetail.textContent = '';
    el.dateLine.textContent = state.loading ? 'Loading today’s times…' : '';
    return;
  }

  el.locationName.textContent = state.place.source === 'gps' ? 'Current location' : state.place.label;
  el.locationDetail.textContent = formatCoords(state.place.latitude, state.place.longitude);

  if (!state.today) {
    el.dateLine.textContent = state.loading ? 'Loading today’s times…' : '';
    return;
  }

  const gregorian = state.today.date.gregorian;
  const hijri = state.today.date.hijri;
  el.dateLine.textContent = `${gregorian.weekday.en} ${Number(gregorian.day)} ${gregorian.month.en} · ${hijri.day} ${hijri.month.en} ${hijri.year}`;
}

function renderStatus() {
  el.banners.replaceChildren();
  const notes = [];

  if (state.today && !navigator.onLine) {
    notes.push('Offline, using saved times.');
  } else if (state.today && state.source === 'cache') {
    notes.push('Could not refresh, using saved times.');
  }

  if (state.usingCityFallback && state.place) {
    const why = state.geoMessage || 'Location is unavailable.';
    notes.push(`${why} Showing ${state.place.label} instead.`);
  }

  if (state.loading && state.today) notes.push('Updating times…');
  if (state.error) notes.push(state.error);

  for (const note of notes) {
    const paragraph = document.createElement('p');
    paragraph.className = 'banner';
    paragraph.textContent = note;
    el.banners.append(paragraph);
  }

  el.retry.hidden = !(state.error && !state.today);
}

function renderMethodLine() {
  if (!state.today) {
    el.methodLine.textContent = '';
    return;
  }
  const method = methodById(state.settings.method);
  const school = state.settings.school === 1 ? 'Hanafi Asr' : 'Standard Asr';
  el.methodLine.textContent = `${method ? method.name : 'Custom method'} · ${school}`;
}

function renderPrayerList() {
  el.prayerList.replaceChildren();
  if (!state.today) return;

  for (const row of ROWS) {
    const item = document.createElement('li');
    const isNext = state.next && !state.next.isTomorrow && !row.sun && state.next.name === row.key;
    item.className = `prayer-row${row.sun ? ' is-sun' : ''}${isNext ? ' is-next' : ''}`;

    const name = document.createElement('span');
    name.className = 'prayer-name';
    name.textContent = row.label;
    if (isNext) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Next';
      name.append(badge);
    }

    const minutes = parseTimeToMinutes(state.today.timings[row.key]);
    const time = document.createElement('time');
    time.className = 'prayer-time';
    time.dateTime = formatClock(minutes);
    time.textContent = formatClock(minutes);

    item.append(name, time);
    el.prayerList.append(item);
  }
}

function renderCountdown() {
  if (!state.today) {
    state.next = null;
    el.nextName.textContent = '—';
    el.countdown.textContent = '--:--:--';
    el.countdownSpoken.textContent = state.loading
      ? 'Loading today’s times…'
      : state.error || 'Times are unavailable.';
    return;
  }

  const next = resolveNextPrayer({
    now: new Date(),
    timeZone: state.timeZone,
    today: state.today,
    tomorrow: state.tomorrow,
  });
  state.next = next;

  const seconds = Math.round((next.at.getTime() - Date.now()) / 1000);
  el.nextName.textContent = next.name;
  el.countdown.textContent = formatCountdown(seconds);

  const minuteBucket = Math.floor(Math.max(0, seconds) / 60);
  const spokenKey = `${next.name}|${next.isTomorrow}|${minuteBucket}`;
  if (spokenKey !== state.spokenKey) {
    state.spokenKey = spokenKey;
    el.countdownSpoken.textContent = describeCountdown(seconds, next.name, next.isTomorrow);
  }

  const listKey = `${next.name}|${next.isTomorrow}`;
  if (listKey !== state.listKey) {
    state.listKey = listKey;
    renderPrayerList();
  }

  if (state.titleKey !== next.name) {
    state.titleKey = next.name;
    document.title = `${next.name} · Prayer Times & Qibla`;
  }
}

function renderCompass() {
  if (!state.place) {
    el.qiblaReadout.textContent = 'Waiting for a location.';
    el.qiblaHelp.textContent = 'The bearing is calculated from your latitude and longitude.';
    el.lubber.hidden = true;
    return;
  }

  const qibla = qiblaBearing(state.place.latitude, state.place.longitude);
  el.qiblaReadout.textContent = `${formatBearing(qibla)} clockwise from true north.`;

  if (state.heading == null) {
    el.compassRose.style.transform = 'rotate(0deg)';
    el.qiblaNeedle.style.transform = `rotate(${qibla}deg)`;
    el.lubber.hidden = true;
    el.qiblaHelp.textContent = compassFallbackHelp();
    return;
  }

  el.compassRose.style.transform = `rotate(${-state.heading}deg)`;
  el.qiblaNeedle.style.transform = `rotate(${needleRotation(qibla, state.heading)}deg)`;
  el.lubber.hidden = false;
  el.qiblaHelp.textContent =
    'Turn until the cyan needle meets the mark at the top. The letters follow real north. A phone compass uses magnetic north; in the UK that is within about a degree of this true-north bearing.';
}

function compassFallbackHelp() {
  if (!window.isSecureContext) {
    return 'The compass and location need HTTPS (or localhost). North is at the top of the dial.';
  }
  if (state.compassMode === 'denied') {
    return 'Compass permission was denied. North is at the top. Face north, then turn clockwise by the angle above.';
  }
  if (state.compassMode === 'needs-tap') {
    return 'North is at the top. Tap Enable compass and the needle will follow the phone. An iPhone always needs that tap.';
  }
  if (state.compassMode === 'listening') {
    return 'North is at the top. Waiting for a compass heading from this phone.';
  }
  return 'No compass on this device. North is at the top. Face north, then turn clockwise by the angle above.';
}

function setupCompass() {
  const canAsk =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function';

  if (canAsk) {
    // iOS 13+ ignores orientation events until requestPermission runs from a tap.
    state.compassMode = 'needs-tap';
    el.compassButton.hidden = false;
    el.compassButton.addEventListener('click', enableCompassFromTap);
    return;
  }

  if (typeof DeviceOrientationEvent === 'undefined' || !window.isSecureContext) {
    state.compassMode = 'unavailable';
    return;
  }

  state.compassMode = 'listening';
  listenForHeading();
}

async function enableCompassFromTap() {
  try {
    const result = await DeviceOrientationEvent.requestPermission();
    if (result !== 'granted') {
      state.compassMode = 'denied';
      el.compassButton.hidden = true;
      renderCompass();
      return;
    }
  } catch {
    state.compassMode = 'denied';
    el.compassButton.hidden = true;
    renderCompass();
    return;
  }

  el.compassButton.hidden = true;
  state.compassMode = 'listening';
  listenForHeading();
  renderCompass();
}

function listenForHeading() {
  window.addEventListener('deviceorientationabsolute', onOrientation, true);
  window.addEventListener('deviceorientation', onOrientation, true);
}

function onOrientation(event) {
  const heading = compassHeadingFromEvent(event);
  if (heading == null) return;

  // Ignore a later non-absolute event once a real compass reading has arrived.
  const trustworthy =
    typeof event.webkitCompassHeading === 'number' ||
    event.absolute === true ||
    event.type === 'deviceorientationabsolute';
  if (!trustworthy) return;

  const factor = prefersReducedMotion ? 1 : 0.25;
  state.heading = smoothHeading(state.heading, heading, factor);
  state.compassMode = 'live';
  renderCompass();
}

function clearReminders() {
  for (const id of reminderTimers) window.clearTimeout(id);
  reminderTimers = [];
}

function collectUpcoming() {
  const upcoming = [];
  const days = [state.today];
  if (state.tomorrow) days.push(state.tomorrow);

  for (const day of days) {
    if (!day) continue;
    const [dayNum, month, year] = day.date.gregorian.date.split('-').map(Number);
    for (const name of PRAYER_NAMES) {
      const minutes = parseTimeToMinutes(day.timings[name]);
      if (!Number.isFinite(minutes)) continue;
      upcoming.push({
        name,
        label: formatClock(minutes),
        at: zonedWallTimeToDate(
          {
            year,
            month,
            day: dayNum,
            hour: Math.floor(minutes / 60),
            minute: minutes % 60,
          },
          state.timeZone,
        ),
      });
    }
  }

  // Last day of a saved month has no tomorrow object. Approximate Fajr with
  // today's clock time on the next civil date. It is usually within a minute.
  if (!state.tomorrow && state.today) {
    const [dayNum, month, year] = state.today.date.gregorian.date.split('-').map(Number);
    const minutes = parseTimeToMinutes(state.today.timings.Fajr);
    if (Number.isFinite(minutes)) {
      upcoming.push({
        name: 'Fajr',
        label: formatClock(minutes),
        at: zonedWallTimeToDate(
          {
            year,
            month,
            day: dayNum + 1,
            hour: Math.floor(minutes / 60),
            minute: minutes % 60,
          },
          state.timeZone,
        ),
      });
    }
  }

  return upcoming;
}

function scheduleReminders() {
  clearReminders();
  if (!state.settings.remindersEnabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!state.today) return;

  const lead = state.settings.reminderMinutes;
  const now = Date.now();
  const icon = new URL('icons/icon-192.png', window.location.href).href;

  for (const prayer of collectUpcoming()) {
    const delay = prayer.at.getTime() - lead * 60 * 1000 - now;
    // setTimeout is fine for "while this page is open". Browsers may delay it
    // in the background. A reminder that fires after the app is closed needs
    // a push server, which is out of scope for v1.
    if (delay < 0 || delay > 36 * 60 * 60 * 1000) continue;

    const id = window.setTimeout(() => {
      if (Notification.permission !== 'granted') return;
      const title =
        lead === 0
          ? `${prayer.name} is now`
          : `${prayer.name} in ${lead} ${lead === 1 ? 'minute' : 'minutes'}`;
      try {
        new Notification(title, {
          body: `${prayer.name} is at ${prayer.label}.`,
          icon,
          tag: `prayer-${prayer.name}-${prayer.at.toISOString()}`,
        });
      } catch {
        // The permission can be revoked between scheduling and firing.
      }
    }, delay);
    reminderTimers.push(id);
  }
}

function setupInstall() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  if (standalone) {
    el.installHelp.textContent = 'This app is installed on your home screen.';
    return;
  }

  if (isIos) {
    el.installHelp.textContent =
      'In Safari, tap the Share button, then Add to Home Screen. Open the app from that icon. iPhone notifications from a website need this, and they need iOS 16.4 or later.';
    return;
  }

  el.installHelp.textContent =
    'On Android, use Install app below if it appears, or the browser menu and then Add to Home screen. The compass and reminders are more reliable from the installed icon.';

  // Chrome fires this when the site is installable. We keep the event so the
  // button's tap can finish the install. There is no equivalent on iPhone.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    el.installButton.hidden = false;
    el.installButton.addEventListener(
      'click',
      async () => {
        el.installButton.hidden = true;
        event.prompt();
        try {
          await event.userChoice;
        } catch {
          // The prompt can be dismissed. The menu path still works.
        }
      },
      { once: true },
    );
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // ./sw.js is next to this page. On GitHub Pages that is /prayer-times/sw.js,
  // and the worker's scope is that folder — not the whole github.io site.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // A failed worker must not break the page. Offline support just stays off.
    });
  });
}

function init() {
  state.settings = loadAppSettings();
  fillSelect(el.method, CALCULATION_METHODS);
  fillSelect(el.school, ASR_SCHOOLS);
  applySettingsToForm();
  bindForm();
  setupCompass();
  setupInstall();
  registerServiceWorker();

  el.retry.addEventListener('click', () => refresh());
  window.addEventListener('online', () => refresh());
  window.addEventListener('offline', () => renderStatus());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleReminders();
  });

  window.setInterval(() => {
    if (state.today) renderCountdown();
  }, 1000);

  refresh();
}

init();

/**
 * Pure date and prayer-time helpers.
 *
 * Aladhan sends clock times as strings like "05:45" or "05:45 (GMT)".
 * Those numbers are local to the place you asked about (Europe/London for
 * Coventry), which is not always the timezone of the phone. The functions
 * here convert that wall-clock time into a real instant so the countdown
 * stays honest.
 */

/** The five prayers. Sunrise is shown in the list but it is not a prayer. */
export const PRAYER_NAMES = Object.freeze(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);

/** "05:45" or "05:45 (GMT)" -> minutes since midnight. NaN if it is not a time. */
export function parseTimeToMinutes(timeString) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(timeString ?? '').trim());
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}

/** Minutes since midnight -> "05:45". Always 24-hour, which matches UK timetables. */
export function formatClock(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return '--:--';
  const rounded = Math.round(totalMinutes);
  const wrapped = ((rounded % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** "01:02:03". Negative values clamp to zero so the display never runs backwards. */
export function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  return [hours, minutes, remain].map((part) => String(part).padStart(2, '0')).join(':');
}

/**
 * A sentence for the screen reader. It changes once a minute, not once a
 * second, so it does not talk over itself.
 */
export function describeCountdown(totalSeconds, prayerName, isTomorrow = false) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${prayerName} is due now`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);

  const when = isTomorrow ? `${prayerName} tomorrow` : prayerName;
  return `${when} in ${parts.join(' and ')}`;
}

/**
 * Which prayer comes next.
 *
 * `nowMinutes` is minutes since local midnight and may include a fraction of
 * a minute (30 seconds is 0.5). A prayer is "next" until its minute is reached.
 * After Isha, the next prayer is tomorrow's Fajr. Sunrise is intentionally
 * not in the list.
 *
 * `tomorrowFajrMinutes` lets the caller pass tomorrow's real Fajr. Without it
 * we reuse today's Fajr, which is within a minute or two.
 */
export function findNextPrayer(timings, nowMinutes, tomorrowFajrMinutes) {
  for (const name of PRAYER_NAMES) {
    const atMinutes = parseTimeToMinutes(timings[name]);
    if (!Number.isFinite(atMinutes)) continue;
    if (nowMinutes < atMinutes) {
      return {
        name,
        atMinutes,
        isTomorrow: false,
        remainingMinutes: atMinutes - nowMinutes,
      };
    }
  }

  const fajrToday = parseTimeToMinutes(timings.Fajr);
  const fajr = Number.isFinite(tomorrowFajrMinutes) ? tomorrowFajrMinutes : fajrToday;
  return {
    name: 'Fajr',
    atMinutes: fajr,
    isTomorrow: true,
    remainingMinutes: 24 * 60 - nowMinutes + fajr,
  };
}

function partsMap(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    hourCycle: 'h23',
  });
  const map = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return map;
}

/** Calendar and clock parts of `date` as seen in an IANA timezone such as Europe/London. */
export function zonedParts(date, timeZone) {
  let map;
  try {
    map = partsMap(date, timeZone);
  } catch {
    map = partsMap(date, 'UTC');
  }

  // Some engines report midnight as "24".
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  const second = Number(map.second);
  const day = String(Number(map.day)).padStart(2, '0');
  const month = String(Number(map.month)).padStart(2, '0');

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute,
    second,
    weekday: map.weekday,
    // Aladhan's gregorian.date looks like "13-11-2026".
    dateKey: `${day}-${month}-${map.year}`,
    minutesSinceMidnight: hour * 60 + minute + second / 60,
  };
}

export function civilYearMonth(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  return { year: parts.year, month: parts.month };
}

/**
 * Minutes to add to UTC to get the wall clock in `timeZone`.
 * Europe/London in November is 0. In July (BST) it is +60.
 */
export function timeZoneOffsetMinutes(date, timeZone) {
  let map;
  try {
    map = partsMap(date, timeZone);
  } catch {
    return 0;
  }
  const hour = Number(map.hour) % 24;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/**
 * Build a Date for a wall-clock time in `timeZone`.
 * `day` may overflow (32 November becomes 2 December) so "tomorrow" is just day + 1.
 */
export function zonedWallTimeToDate({ year, month, day, hour, minute }, timeZone) {
  const normalized = new Date(Date.UTC(year, month - 1, day));
  const y = normalized.getUTCFullYear();
  const m = normalized.getUTCMonth() + 1;
  const d = normalized.getUTCDate();

  // First guess treats the wall clock as if it were UTC, then shifts by the offset.
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
  const offset = timeZoneOffsetMinutes(guess, timeZone);
  let result = new Date(guess.getTime() - offset * 60000);

  // Around a daylight-saving change the offset at the guess can be wrong. One
  // more pass uses the offset at the corrected instant.
  const offsetAgain = timeZoneOffsetMinutes(result, timeZone);
  if (offsetAgain !== offset) {
    result = new Date(guess.getTime() - offsetAgain * 60000);
  }
  return result;
}

/**
 * Next prayer plus the exact instant it starts.
 * `today` and `tomorrow` are day objects from the Aladhan calendar.
 * `tomorrow` may be null on the last day of a saved month.
 */
export function resolveNextPrayer({ now, timeZone, today, tomorrow }) {
  const nowParts = zonedParts(now, timeZone);
  const tomorrowFajr = tomorrow ? parseTimeToMinutes(tomorrow.timings.Fajr) : undefined;
  const next = findNextPrayer(today.timings, nowParts.minutesSinceMidnight, tomorrowFajr);

  const [day, month, year] = today.date.gregorian.date.split('-').map(Number);
  const at = zonedWallTimeToDate(
    {
      year,
      month,
      day: day + (next.isTomorrow ? 1 : 0),
      hour: Math.floor(next.atMinutes / 60),
      minute: next.atMinutes % 60,
    },
    timeZone,
  );

  return { ...next, at, timeZone };
}

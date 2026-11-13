import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeCountdown,
  findNextPrayer,
  formatClock,
  formatCountdown,
  parseTimeToMinutes,
  resolveNextPrayer,
  zonedWallTimeToDate,
} from '../lib/prayer.js';

// Real Coventry times for 13 Nov 2026, Moonsighting Committee, Hanafi Asr.
// Sunrise is in the payload on purpose: the next-prayer logic must skip it.
const TODAY = {
  timings: {
    Fajr: '05:45 (GMT)',
    Sunrise: '07:24 (GMT)',
    Dhuhr: '11:50 (GMT)',
    Asr: '14:29 (GMT)',
    Maghrib: '16:16 (GMT)',
    Isha: '17:46 (GMT)',
  },
  date: { gregorian: { date: '13-11-2026' } },
};

const TOMORROW = {
  timings: { Fajr: '05:47 (GMT)' },
  date: { gregorian: { date: '14-11-2026' } },
};

test('parseTimeToMinutes strips the timezone note Aladhan appends', () => {
  assert.equal(parseTimeToMinutes('05:45 (GMT)'), 5 * 60 + 45);
  assert.equal(parseTimeToMinutes('17:46'), 17 * 60 + 46);
  assert.equal(formatClock(parseTimeToMinutes('05:45 (GMT)')), '05:45');
});

test('before Fajr, Fajr is next', () => {
  const next = findNextPrayer(TODAY.timings, 5 * 60, 5 * 60 + 47);
  assert.equal(next.name, 'Fajr');
  assert.equal(next.isTomorrow, false);
  assert.equal(next.remainingMinutes, 45);
});

test('between Fajr and sunrise the next prayer is Dhuhr, not sunrise', () => {
  const next = findNextPrayer(TODAY.timings, 7 * 60);
  assert.equal(next.name, 'Dhuhr');
});

test('midday counts down to Asr', () => {
  // 12:00 is 720 minutes. Asr at 14:29 is 869. 869 - 720 = 149 minutes.
  const next = findNextPrayer(TODAY.timings, 12 * 60);
  assert.equal(next.name, 'Asr');
  assert.equal(next.remainingMinutes, 149);
});

test('at the exact Asr minute, Asr has started and Maghrib is next', () => {
  const next = findNextPrayer(TODAY.timings, 14 * 60 + 29);
  assert.equal(next.name, 'Maghrib');
});

test('after Isha the next prayer is tomorrow Fajr, using tomorrow’s time', () => {
  const now = 18 * 60;
  const next = findNextPrayer(TODAY.timings, now, 5 * 60 + 47);
  assert.equal(next.name, 'Fajr');
  assert.equal(next.isTomorrow, true);
  assert.equal(next.atMinutes, 5 * 60 + 47);
  // From 18:00 to midnight is 6 hours, plus 05:47.
  assert.equal(next.remainingMinutes, 6 * 60 + 5 * 60 + 47);
});

test('countdown formatting', () => {
  assert.equal(formatCountdown(3661), '01:01:01');
  assert.equal(formatCountdown(0), '00:00:00');
  assert.equal(formatCountdown(-4), '00:00:00');
  assert.equal(describeCountdown(3700, 'Asr'), 'Asr in 1 hour and 1 minute');
  assert.equal(describeCountdown(125, 'Dhuhr'), 'Dhuhr in 2 minutes');
  assert.equal(describeCountdown(30, 'Fajr'), 'Fajr is due now');
  assert.equal(describeCountdown(8 * 3600, 'Fajr', true), 'Fajr tomorrow in 8 hours');
});

test('London wall-clock times become the right UTC instant', () => {
  // 13 Nov 2026 is GMT (offset 0). 13 July 2026 is BST (offset +60).
  const winter = zonedWallTimeToDate(
    { year: 2026, month: 11, day: 13, hour: 13, minute: 0 },
    'Europe/London',
  );
  const summer = zonedWallTimeToDate(
    { year: 2026, month: 7, day: 13, hour: 13, minute: 0 },
    'Europe/London',
  );
  assert.equal(winter.toISOString(), '2026-11-13T13:00:00.000Z');
  assert.equal(summer.toISOString(), '2026-07-13T12:00:00.000Z');
});

test('resolveNextPrayer ties the timetable to a real countdown instant', () => {
  const midday = resolveNextPrayer({
    now: new Date('2026-11-13T12:00:00Z'),
    timeZone: 'Europe/London',
    today: TODAY,
    tomorrow: TOMORROW,
  });
  assert.equal(midday.name, 'Asr');
  assert.equal(midday.isTomorrow, false);
  assert.equal(midday.at.toISOString(), '2026-11-13T14:29:00.000Z');
  assert.equal(formatCountdown((midday.at.getTime() - Date.parse('2026-11-13T12:00:00Z')) / 1000), '02:29:00');

  const evening = resolveNextPrayer({
    now: new Date('2026-11-13T18:00:00Z'),
    timeZone: 'Europe/London',
    today: TODAY,
    tomorrow: TOMORROW,
  });
  assert.equal(evening.name, 'Fajr');
  assert.equal(evening.isTomorrow, true);
  assert.equal(evening.at.toISOString(), '2026-11-14T05:47:00.000Z');

  const beforeDawn = resolveNextPrayer({
    now: new Date('2026-11-13T05:00:00Z'),
    timeZone: 'Europe/London',
    today: TODAY,
    tomorrow: TOMORROW,
  });
  assert.equal(beforeDawn.name, 'Fajr');
  assert.equal(beforeDawn.at.toISOString(), '2026-11-13T05:45:00.000Z');
});

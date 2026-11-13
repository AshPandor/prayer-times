import assert from 'node:assert/strict';
import test from 'node:test';

import { qiblaBearing } from '../lib/qibla.js';
import {
  MOSQUE,
  attachHijri,
  clockFromApi,
  jamahLabel,
  nextMosqueMoment,
  normalizeMosqueDay,
  unwrapMosqueDays,
} from '../lib/mosque.js';

// 13 Nov 2026, taken from the mosque's own API.
const TODAY_ROW = {
  d_date: '2026-11-13',
  fajr_begins: '05:39:00',
  fajr_jamah: '06:45:00',
  sunrise: '07:23:00',
  zuhr_begins: '11:53:00',
  zuhr_jamah: '13:00:00',
  asr_mithl_1: '14:28:00',
  asr_mithl_2: '14:28:00',
  asr_jamah: '15:10:00',
  maghrib_begins: '16:18:00',
  maghrib_jamah: '16:18:00',
  isha_begins: '17:54:00',
  isha_jamah: '19:45:00',
  hijri_date_convert: '2 Jumādā ath-Thāniya 1448',
};

const TOMORROW_ROW = {
  d_date: '2026-11-14',
  fajr_begins: '05:40:00',
  fajr_jamah: '06:45:00',
  sunrise: '07:24:00',
  zuhr_begins: '11:53:00',
  zuhr_jamah: '13:00:00',
  asr_mithl_1: '14:27:00',
  asr_mithl_2: '14:27:00',
  asr_jamah: '15:10:00',
  maghrib_begins: '16:17:00',
  maghrib_jamah: '16:17:00',
  isha_begins: '17:53:00',
  isha_jamah: '18:30:00',
};

const today = normalizeMosqueDay(TODAY_ROW);
const tomorrow = normalizeMosqueDay(TOMORROW_ROW);

test('the mosque row keeps beginning times and jamaat apart', () => {
  assert.equal(clockFromApi('05:39:00'), '05:39');
  assert.equal(today.timings.Fajr, '05:39');
  assert.equal(today.jamah.Fajr, '06:45');
  assert.equal(today.timings.Sunrise, '07:23');
  assert.equal(today.timings.Dhuhr, '11:53');
  assert.equal(today.jamah.Dhuhr, '13:00');
  assert.equal(today.timings.Asr, '14:28');
  assert.equal(today.jamah.Asr, '15:10');
  assert.equal(today.timings.Maghrib, '16:18');
  assert.equal(today.timings.Isha, '17:54');
  assert.equal(today.jamah.Isha, '19:45');
  assert.equal(today.isFriday, true);
  assert.equal(today.date.gregorian.weekday.en, 'Friday');
  assert.equal(jamahLabel(today, 'Dhuhr'), "Jumu'ah");
  assert.equal(jamahLabel(tomorrow, 'Dhuhr'), 'Dhuhr jamaat');
});

test('before Fajr the next moment is Fajr beginning, not jamaat', () => {
  const next = nextMosqueMoment(today, tomorrow, 4 * 60);
  assert.equal(next.label, 'Fajr');
  assert.equal(next.kind, 'begins');
  assert.equal(next.atMinutes, 5 * 60 + 39);
  assert.equal(next.isTomorrow, false);
});

test('after Fajr has begun, the next moment is Fajr jamaat', () => {
  const next = nextMosqueMoment(today, tomorrow, 6 * 60);
  assert.equal(next.label, 'Fajr jamaat');
  assert.equal(next.kind, 'jamah');
  assert.equal(next.atMinutes, 6 * 60 + 45);
});

test('Friday afternoon counts down to Jumu\'ah, and Maghrib is not doubled', () => {
  const jumuah = nextMosqueMoment(today, tomorrow, 12 * 60);
  assert.equal(jumuah.label, "Jumu'ah");
  assert.equal(jumuah.name, 'Dhuhr');
  assert.equal(jumuah.atMinutes, 13 * 60);

  // 16:00 is after Asr jamaat (15:10) and before Maghrib (16:18).
  const maghrib = nextMosqueMoment(today, tomorrow, 16 * 60);
  assert.equal(maghrib.label, 'Maghrib');
  assert.equal(maghrib.kind, 'begins');
  assert.equal(maghrib.atMinutes, 16 * 60 + 18);
});

test('after Isha jamaat the next moment is tomorrow Fajr', () => {
  const next = nextMosqueMoment(today, tomorrow, 21 * 60);
  assert.equal(next.label, 'Fajr');
  assert.equal(next.isTomorrow, true);
  assert.equal(next.atMinutes, 5 * 60 + 40);
});

test('the year feed is unwrapped and sorted, and Hijri is attached from today', () => {
  const days = unwrapMosqueDays([[TOMORROW_ROW, TODAY_ROW]]);
  assert.deepEqual(days.map((day) => day.isoDate), ['2026-11-13', '2026-11-14']);
  const withHijri = attachHijri(days, [TODAY_ROW]);
  assert.equal(withHijri[0].hijriLabel, '2 Jumādā ath-Thāniya 1448');
  assert.equal(withHijri[1].hijriLabel, '');
});

test('qibla from the mosque is still about 119 degrees', () => {
  const bearing = qiblaBearing(MOSQUE.latitude, MOSQUE.longitude);
  assert.ok(bearing > 118 && bearing < 120, `got ${bearing}`);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { monthRecordMatches, calendarUrl } from '../lib/aladhan.js';
import { geocodingUrl, isDefaultCoventry, pickPlace } from '../lib/places.js';

const RESULTS = [
  {
    name: 'Coventry',
    admin1: 'England',
    country: 'United Kingdom',
    country_code: 'GB',
    latitude: 52.40656,
    longitude: -1.51217,
    timezone: 'Europe/London',
  },
  {
    name: 'Coventry',
    admin1: 'Rhode Island',
    country: 'United States',
    country_code: 'US',
    latitude: 41.7001,
    longitude: -71.68284,
    timezone: 'America/New_York',
  },
];

test('Coventry, UK picks England and not Rhode Island', () => {
  const place = pickPlace(RESULTS, { country: 'United Kingdom' });
  assert.equal(place.label, 'Coventry, England');
  assert.equal(place.latitude, 52.40656);
  assert.equal(place.timeZone, 'Europe/London');
});

test('country aliases and a miss', () => {
  assert.equal(pickPlace(RESULTS, { country: 'UK' }).countryCode, 'GB');
  assert.equal(pickPlace(RESULTS, { country: 'England' }).region, 'England');
  assert.equal(pickPlace(RESULTS, { country: 'USA' }).region, 'Rhode Island');
  assert.equal(pickPlace(RESULTS, { country: 'Narnia' }), null);
});

test('the built-in fallback recognises the default city', () => {
  assert.equal(isDefaultCoventry('Coventry', 'UK'), true);
  assert.equal(isDefaultCoventry('Coventry', 'United Kingdom'), true);
  assert.equal(isDefaultCoventry('London', 'UK'), false);
});

test('calendar URL carries coordinates, method and Asr school', () => {
  const url = new URL(
    calendarUrl({
      latitude: 52.4,
      longitude: -1.5,
      year: 2026,
      month: 11,
      method: 15,
      school: 1,
    }),
  );
  assert.equal(url.pathname, '/v1/calendar/2026/11');
  assert.equal(url.searchParams.get('latitude'), '52.4');
  assert.equal(url.searchParams.get('longitude'), '-1.5');
  assert.equal(url.searchParams.get('method'), '15');
  assert.equal(url.searchParams.get('school'), '1');
  assert.match(geocodingUrl('Coventry'), /name=Coventry/);
});

test('a saved month matches a nearby fix and rejects a different method', () => {
  const record = {
    latitude: 52.406,
    longitude: -1.512,
    method: 15,
    school: 1,
    year: 2026,
    month: 11,
    days: [{}],
  };
  assert.equal(
    monthRecordMatches(record, { latitude: 52.408, longitude: -1.51, method: 15, school: 1, year: 2026, month: 11 }),
    true,
  );
  assert.equal(
    monthRecordMatches(record, { latitude: 52.406, longitude: -1.512, method: 3, school: 1, year: 2026, month: 11 }),
    false,
  );
});

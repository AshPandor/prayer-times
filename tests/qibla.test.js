import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compassHeadingFromEvent,
  formatBearing,
  initialBearing,
  needleRotation,
  qiblaBearing,
  smoothHeading,
} from '../lib/qibla.js';

test('qibla from Coventry is about 119 degrees from true north', () => {
  // City centre. The Kaaba is to the south-east, so the bearing is a bit
  // east of 90. People often quote "about 119" for the Midlands; the formula
  // lands on 118.3, which rounds to that.
  const bearing = qiblaBearing(52.4068, -1.5197);
  assert.ok(bearing > 118 && bearing < 120, `expected about 119, got ${bearing}`);
  assert.ok(Math.abs(bearing - 118.29) < 0.05, `got ${bearing}`);
});

test('the geocoder point for Coventry is the same direction', () => {
  const bearing = qiblaBearing(52.40656, -1.51217);
  assert.ok(bearing > 118 && bearing < 120, `got ${bearing}`);
});

test('a point due south of the Kaaba faces north, and due north faces south', () => {
  // Same longitude as the Kaaba, so the great circle is the meridian.
  const southOfKaaba = initialBearing(
    { latitude: 11.4225, longitude: 39.8262 },
    { latitude: 21.4225, longitude: 39.8262 },
  );
  const northOfKaaba = qiblaBearing(31.4225, 39.8262);

  assert.ok(southOfKaaba < 0.001 || southOfKaaba > 359.999, southOfKaaba);
  assert.ok(Math.abs(northOfKaaba - 180) < 0.001, northOfKaaba);
});

test('the needle stands upright when you are already facing the Qibla', () => {
  assert.equal(needleRotation(118.3, 118.3), 0);
  assert.equal(needleRotation(10, 350), 20);
  assert.equal(needleRotation(350, 10), 340);
});

test('compass events: iPhone heading, absolute alpha, and relative alpha', () => {
  // webkitCompassHeading is already clockwise from north.
  assert.equal(compassHeadingFromEvent({ webkitCompassHeading: 90, alpha: 0, absolute: false }), 90);

  // Absolute alpha increases counter-clockwise, so 90 becomes a heading of 270.
  assert.equal(compassHeadingFromEvent({ alpha: 90, absolute: true }), 270);
  assert.equal(compassHeadingFromEvent({ alpha: 0, absolute: true, type: 'deviceorientation' }), 0);
  assert.equal(
    compassHeadingFromEvent({ alpha: 270, absolute: false, type: 'deviceorientationabsolute' }),
    90,
  );

  // A non-absolute alpha is not north. Using it would spin the needle at random.
  assert.equal(compassHeadingFromEvent({ alpha: 90, absolute: false }), null);
  assert.equal(compassHeadingFromEvent(null), null);
});

test('smoothing takes the short way across north', () => {
  // 350 -> 10 is a 20 degree clockwise step, not a 340 degree spin.
  const eased = smoothHeading(350, 10, 0.5);
  assert.ok(eased > 350 || eased < 20, eased);
  assert.ok(Math.abs(((eased - 350 + 540) % 360) - 180) > 0);
  assert.equal(Math.round(eased), 0);
});

test('formatBearing keeps one decimal', () => {
  assert.equal(formatBearing(118.2868), '118.3°');
  assert.equal(formatBearing(-1), '359.0°');
});

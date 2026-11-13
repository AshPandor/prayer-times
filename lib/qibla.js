/**
 * Qibla direction, worked out on the phone.
 *
 * The Kaaba is a fixed point. The bearing below is the initial great-circle
 * course from where you are standing to that point: degrees clockwise from
 * true north. It does not use the network.
 *
 * A phone compass usually reports magnetic north. In the UK the gap between
 * magnetic and true north is about a degree, which is smaller than the wobble
 * of holding a phone in your hand, so v1 does not apply a declination fix.
 */

/** Official-style coordinates for the Kaaba. */
export const KAABA = Object.freeze({
  latitude: 21.4225,
  longitude: 39.8262,
});

/** Wrap any angle into the range [0, 360). */
export function normalizeDegrees(degrees) {
  if (!Number.isFinite(degrees)) return NaN;
  return ((degrees % 360) + 360) % 360;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Initial great-circle bearing from `from` to `to`, clockwise from true north.
 * Both arguments are `{ latitude, longitude }` in decimal degrees.
 *
 * This is the standard "forward azimuth" formula. A point due south of the
 * destination gives 0 (face north). A point due north gives 180 (face south).
 * Due east and due west are not exactly 90 and 270 away from the equator,
 * because a great circle bends toward the pole.
 */
export function initialBearing(from, to) {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

/** Bearing from a latitude/longitude to the Kaaba. */
export function qiblaBearing(latitude, longitude) {
  return initialBearing({ latitude, longitude }, KAABA);
}

/**
 * How far to rotate a needle that points "up" the screen, in degrees clockwise,
 * so that it aims at the Qibla.
 *
 * `headingDegrees` is where the top of the phone is pointing (0 = true north).
 * When you are already facing the Qibla, this returns 0 and the needle is upright.
 */
export function needleRotation(qiblaDegrees, headingDegrees) {
  return normalizeDegrees(qiblaDegrees - headingDegrees);
}

/**
 * Read a compass heading from a DeviceOrientation event.
 *
 * Returns degrees clockwise from north, or null when the event is not a real
 * compass reading.
 *
 * iPhone (Safari) exposes `webkitCompassHeading`, already clockwise from
 * magnetic north. Other browsers expose `alpha`, which increases as you turn
 * counter-clockwise, and only means "from north" when the reading is absolute.
 * A non-absolute `alpha` is relative to however the phone was held when the
 * page loaded, so we ignore it rather than point the needle the wrong way.
 */
export function compassHeadingFromEvent(event) {
  if (!event) return null;

  const webkitHeading = event.webkitCompassHeading;
  if (typeof webkitHeading === 'number' && Number.isFinite(webkitHeading)) {
    return normalizeDegrees(webkitHeading);
  }

  const isAbsolute = event.absolute === true || event.type === 'deviceorientationabsolute';
  if (!isAbsolute) return null;
  if (typeof event.alpha !== 'number' || !Number.isFinite(event.alpha)) return null;

  return normalizeDegrees(360 - event.alpha);
}

/**
 * Ease a compass heading toward a new reading without spinning the long way
 * around when the number wraps from 359 to 0.
 */
export function smoothHeading(previous, next, factor = 0.2) {
  if (!Number.isFinite(next)) return previous;
  if (previous == null || !Number.isFinite(previous) || factor >= 1) {
    return normalizeDegrees(next);
  }
  const delta = ((next - previous + 540) % 360) - 180;
  return normalizeDegrees(previous + delta * factor);
}

/** One decimal place, for the on-screen readout. 118.3° is "about 119°". */
export function formatBearing(degrees) {
  return `${normalizeDegrees(degrees).toFixed(1)}°`;
}

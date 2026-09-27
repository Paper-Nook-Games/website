'use strict';

// Whitelist dogrulama. Her sanitizer yeni bir satir nesnesi kurar: yalniz sozlesmedeki
// alanlar kopyalanir, bilinmeyen alanlar sessizce duser (DB'ye gecmez).
// Gizlilik siniri: IP, request header'lari, isim/email/SteamID gibi alanlar hicbir
// satira yazilmaz - istemci gonderse bile whitelist disinda kalir.

const { LIMITS } = require('./config');

class ValidationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new ValidationError(code);
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?(?:\+[0-9A-Za-z.-]{1,32})?$/;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const EVENT_NAME = /^[a-z0-9_]{1,64}$/;
const PROPERTY_KEY = /^[a-z0-9_]{1,40}$/;
const WISHLIST = new Set(['yes', 'maybe', 'no']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isAbsent(v) {
  return v === undefined || v === null;
}

// Zorunlu metin: trim + [min, max]. Uzun metin reddedilir, kesilmez.
function requiredString(obj, key, max, min = 1) {
  const v = obj[key];
  if (typeof v !== 'string') fail(`invalid_${key}`);
  const s = v.trim();
  if (s.length > max) fail(`${key}_too_long`);
  if (s.length < min) fail(`invalid_${key}`);
  return s;
}

// Opsiyonel metin: yoksa/null ise `fallback`.
function optionalString(obj, key, max, fallback = null) {
  const v = obj[key];
  if (isAbsent(v)) return fallback;
  if (typeof v !== 'string') fail(`invalid_${key}`);
  const s = v.trim();
  if (s.length > max) fail(`${key}_too_long`);
  return s;
}

function optionalInt(obj, key, min, max) {
  const v = obj[key];
  if (isAbsent(v)) return null;
  if (!Number.isInteger(v) || v < min || v > max) fail(`invalid_${key}`);
  return v;
}

function optionalBool(obj, key) {
  const v = obj[key];
  if (isAbsent(v)) return null;
  if (typeof v !== 'boolean') fail(`invalid_${key}`);
  return v;
}

// ISO-8601 zaman damgasi; normalize edilmis UTC ISO dondurur.
function isoTimestamp(v, code) {
  if (typeof v !== 'string' || v.length > LIMITS.isoLength || !ISO_8601.test(v)) fail(code);
  const t = Date.parse(v);
  if (Number.isNaN(t)) fail(code);
  return new Date(t).toISOString();
}

// Duz (flat) properties nesnesi: <=20 anahtar, [a-z0-9_]{1,40}, deger string<=200 |
// sonlu sayi | boolean | null, serialize <=2048 byte.
function sanitizeProperties(v) {
  if (isAbsent(v)) return {};
  if (!isPlainObject(v)) fail('invalid_properties');
  const keys = Object.keys(v);
  if (keys.length > LIMITS.propertyKeys) fail('too_many_properties');
  const out = {};
  for (const k of keys) {
    if (!PROPERTY_KEY.test(k) || k === '__proto__') fail('invalid_property_key');
    const val = v[k];
    if (val === null || typeof val === 'boolean') out[k] = val;
    else if (typeof val === 'number') {
      if (!Number.isFinite(val)) fail('invalid_property_value');
      out[k] = val;
    } else if (typeof val === 'string') {
      if (val.length > LIMITS.propertyString) fail('property_value_too_long');
      out[k] = val;
    } else fail('invalid_property_value');
  }
  if (Buffer.byteLength(JSON.stringify(out), 'utf8') > LIMITS.propertyBytes) fail('properties_too_large');
  return out;
}

function requireObjectBody(body) {
  if (!isPlainObject(body)) fail('invalid_body');
  return body;
}

// Her uc govdede ortak kimlik alanlari (anonim; gercek kullanici kimligi degil).
function sanitizeIdentity(b) {
  const installation_id = b.installation_id;
  if (typeof installation_id !== 'string' || !UUID_V4.test(installation_id)) fail('invalid_installation_id');
  const session_id = b.session_id;
  if (typeof session_id !== 'string' || !UUID_V4.test(session_id)) fail('invalid_session_id');
  const version = b.version;
  if (typeof version !== 'string' || !SEMVER.test(version)) fail('invalid_version');
  if (b.profile !== 'playtest') fail('invalid_profile');
  const locale = requiredString(b, 'locale', LIMITS.locale);
  return {
    installation_id: installation_id.toLowerCase(),
    session_id: session_id.toLowerCase(),
    version,
    profile: 'playtest',
    locale,
  };
}

function sanitizeContext(b) {
  return {
    ...sanitizeIdentity(b),
    day: optionalInt(b, 'day', 0, LIMITS.maxDay),
    weekday: optionalString(b, 'weekday', LIMITS.weekday),
    current_screen: optionalString(b, 'current_screen', LIMITS.currentScreen),
    active_quest: optionalString(b, 'active_quest', LIMITS.activeQuest),
    session_seconds: optionalInt(b, 'session_seconds', 0, LIMITS.maxSessionSeconds),
    resolution: optionalString(b, 'resolution', LIMITS.resolution),
    display_mode: optionalString(b, 'display_mode', LIMITS.displayMode),
  };
}

function validateFeedback(body) {
  const b = requireObjectBody(body);
  const ctx = sanitizeContext(b);
  const rating = b.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail('invalid_rating');
  if (typeof b.would_wishlist !== 'string' || !WISHLIST.has(b.would_wishlist)) fail('invalid_would_wishlist');
  const row = {
    ...ctx,
    rating,
    enjoyed_most: optionalString(b, 'enjoyed_most', LIMITS.text, ''),
    confusing: optionalString(b, 'confusing', LIMITS.text, ''),
    understood_earn_money: optionalBool(b, 'understood_earn_money'),
    understood_open_packs: optionalBool(b, 'understood_open_packs'),
    understood_build_deck: optionalBool(b, 'understood_build_deck'),
    understood_duel: optionalBool(b, 'understood_duel'),
    understood_fish: optionalBool(b, 'understood_fish'),
    understood_farm: optionalBool(b, 'understood_farm'),
    unknown_how_to: optionalString(b, 'unknown_how_to', LIMITS.text, ''),
    would_wishlist: b.would_wishlist,
    anything_else: optionalString(b, 'anything_else', LIMITS.text, ''),
  };
  return { installationId: ctx.installation_id, rows: [row] };
}

function sanitizeRecentEvents(v) {
  if (isAbsent(v)) return null;
  if (!Array.isArray(v)) fail('invalid_recent_events');
  if (v.length > LIMITS.recentItems) fail('too_many_recent_events');
  return v.map((e) => {
    if (!isPlainObject(e)) fail('invalid_recent_events');
    if (typeof e.name !== 'string' || e.name.length < 1 || e.name.length > LIMITS.recentEventName) {
      fail('invalid_recent_events');
    }
    return {
      name: e.name,
      at: isoTimestamp(e.at, 'invalid_recent_events'),
      properties: sanitizeProperties(e.properties),
    };
  });
}

function sanitizeRecentErrors(v) {
  if (isAbsent(v)) return null;
  if (!Array.isArray(v)) fail('invalid_recent_errors');
  if (v.length > LIMITS.recentItems) fail('too_many_recent_errors');
  return v.map((e) => {
    if (!isPlainObject(e)) fail('invalid_recent_errors');
    if (typeof e.message !== 'string' || e.message.length > LIMITS.recentErrorMessage) fail('invalid_recent_errors');
    let source = null;
    if (!isAbsent(e.source)) {
      if (typeof e.source !== 'string' || e.source.length > LIMITS.recentErrorSource) fail('invalid_recent_errors');
      source = e.source;
    }
    return { message: e.message, source, at: isoTimestamp(e.at, 'invalid_recent_errors') };
  });
}

function validateBugReport(body) {
  const b = requireObjectBody(body);
  const ctx = sanitizeContext(b);
  const row = {
    ...ctx,
    title: requiredString(b, 'title', LIMITS.title),
    what_happened: requiredString(b, 'what_happened', LIMITS.text),
    expected_behavior: optionalString(b, 'expected_behavior', LIMITS.text, ''),
    steps_to_reproduce: optionalString(b, 'steps_to_reproduce', LIMITS.text, ''),
    recent_events: sanitizeRecentEvents(b.recent_events),
    recent_errors: sanitizeRecentErrors(b.recent_errors),
  };
  return { installationId: ctx.installation_id, rows: [row] };
}

function validateEvents(body) {
  const b = requireObjectBody(body);
  const id = sanitizeIdentity(b);
  const events = b.events;
  if (!Array.isArray(events) || events.length < 1) fail('invalid_events');
  if (events.length > LIMITS.eventsPerBatch) fail('too_many_events');
  const rows = events.map((e) => {
    if (!isPlainObject(e)) fail('invalid_event');
    if (typeof e.event_name !== 'string' || !EVENT_NAME.test(e.event_name)) fail('invalid_event_name');
    return {
      ...id,
      event_name: e.event_name,
      occurred_at: isoTimestamp(e.occurred_at, 'invalid_occurred_at'),
      play_day: optionalInt(e, 'play_day', 0, LIMITS.maxDay),
      weekday: optionalString(e, 'weekday', LIMITS.weekday),
      current_screen: optionalString(e, 'current_screen', LIMITS.currentScreen),
      properties: sanitizeProperties(e.properties),
    };
  });
  return { installationId: id.installation_id, rows };
}

module.exports = {
  ValidationError,
  validateFeedback,
  validateBugReport,
  validateEvents,
  sanitizeProperties,
};

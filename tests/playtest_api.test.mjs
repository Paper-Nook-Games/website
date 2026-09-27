// Playtest API testleri - bagimliliksiz: `node tests/playtest_api.test.mjs`
// Handler'lar mock req/res ve mock global fetch ile cagrilir; ag/DB'ye gidilmez.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const feedback = require('../api/playtest/feedback.js');
const bugReport = require('../api/playtest/bug-report.js');
const events = require('../api/playtest/events.js');

const FAKE_URL = 'https://example-project.supabase.co';
const FAKE_KEY = 'test-service-role-key-DO-NOT-LEAK-7f3a';

// ---------------------------------------------------------------------------
// Mock altyapisi
// ---------------------------------------------------------------------------

function mockReq({ method = 'POST', body, raw, headers = {}, contentType = 'application/json' } = {}) {
  const h = { ...headers };
  if (contentType) h['content-type'] = contentType;
  let req;
  if (raw !== undefined) {
    // Vercel helper'lari olmayan ortam: govde stream'den okunur.
    req = Readable.from([Buffer.from(raw)]);
    h['content-length'] = h['content-length'] ?? String(Buffer.byteLength(raw));
  } else {
    req = {};
    if (body !== undefined) req.body = body;
  }
  req.method = method;
  req.headers = h;
  return req;
}

function mockRes() {
  const headers = {};
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  return {
    statusCode: 200,
    headers,
    body: '',
    ended: false,
    done,
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[k.toLowerCase()];
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk);
      this.ended = true;
      resolveDone();
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

let fetchCalls = [];
let fetchPlan = {};

function installFetch({ count = 0, countStatus = 200, insertStatus = 201, insertBody = '' } = {}) {
  fetchCalls = [];
  fetchPlan = { count, countStatus, insertStatus, insertBody };
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body };
    fetchCalls.push(call);
    if (call.method === 'HEAD') {
      return {
        ok: fetchPlan.countStatus >= 200 && fetchPlan.countStatus < 300,
        status: fetchPlan.countStatus,
        headers: new Headers({ 'content-range': `*/${fetchPlan.count}` }),
        text: async () => '',
      };
    }
    return {
      ok: fetchPlan.insertStatus >= 200 && fetchPlan.insertStatus < 300,
      status: fetchPlan.insertStatus,
      headers: new Headers(),
      text: async () => fetchPlan.insertBody,
    };
  };
}

function setEnv(on = true) {
  if (on) {
    process.env.SUPABASE_URL = FAKE_URL + '/';
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
  } else {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

// console.error ciktisini yakala (secret sizintisi kontrolu icin).
let consoleLines = [];
const origError = console.error;
console.error = (...args) => {
  consoleLines.push(args.map(String).join(' '));
};

async function call(handler, reqOpts) {
  const req = mockReq(reqOpts);
  const res = mockRes();
  await handler(req, res);
  await res.done;
  return res;
}

function insertCall() {
  return fetchCalls.find((c) => c.method === 'POST');
}

function insertedRows() {
  const c = insertCall();
  assert.ok(c, 'Supabase insert cagrisi yapilmali');
  return JSON.parse(c.body);
}

// ---------------------------------------------------------------------------
// Ornek govdeler
// ---------------------------------------------------------------------------

const IDS = {
  installation_id: '3f2b8c1e-9d4a-4f6b-8a2c-1e5d7f9b0a13',
  session_id: 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d',
};

function context(extra = {}) {
  return {
    ...IDS,
    version: '0.1.4',
    profile: 'playtest',
    locale: 'en',
    day: 3,
    weekday: 'Wed',
    current_screen: 'town',
    active_quest: 'first_pack',
    session_seconds: 1234,
    resolution: '1920x1080',
    display_mode: 'windowed',
    ...extra,
  };
}

function feedbackBody(extra = {}) {
  return {
    ...context(),
    rating: 4,
    enjoyed_most: 'Opening packs',
    confusing: '',
    understood_earn_money: true,
    understood_open_packs: true,
    understood_build_deck: false,
    understood_duel: true,
    understood_fish: null,
    understood_farm: false,
    unknown_how_to: 'farm',
    would_wishlist: 'maybe',
    anything_else: '',
    ...extra,
  };
}

function bugBody(extra = {}) {
  return {
    ...context(),
    title: 'Card vanished',
    what_happened: 'After a duel the reward card disappeared.',
    expected_behavior: 'Card in binder',
    steps_to_reproduce: '1. duel 2. win',
    recent_events: [{ name: 'duel_end', at: '2026-09-27T10:00:00.000Z', properties: { won: true, turns: 7 } }],
    recent_errors: [{ message: 'TypeError: x is undefined', source: 'duel.js:42', at: '2026-09-27T10:00:01.000Z' }],
    ...extra,
  };
}

function eventsBody(n = 2, extra = {}) {
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      event_name: 'pack_opened',
      occurred_at: '2026-09-27T10:00:00.000Z',
      play_day: 2,
      weekday: 'Tue',
      current_screen: 'shop',
      properties: { pack_id: 'base', cost: 100, rare: false, extra: null },
    });
  }
  return {
    installation_id: IDS.installation_id,
    session_id: IDS.session_id,
    version: '0.1.4',
    profile: 'playtest',
    locale: 'tr',
    events: list,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Mini test kosucu
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ---- Method / CORS ---------------------------------------------------------

for (const [name, h] of [['feedback', feedback], ['bug-report', bugReport], ['events', events]]) {
  test(`${name}: GET -> 405 with Allow header, no DB call`, async () => {
    setEnv(true);
    installFetch();
    const res = await call(h, { method: 'GET' });
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers['allow'], 'POST, OPTIONS');
    assert.deepEqual(res.json(), { ok: false, error: 'method_not_allowed' });
    assert.equal(fetchCalls.length, 0);
  });

  test(`${name}: OPTIONS preflight -> 204 with CORS headers`, async () => {
    installFetch();
    const res = await call(h, { method: 'OPTIONS', contentType: null });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.equal(res.headers['access-control-allow-methods'], 'POST, OPTIONS');
    assert.equal(res.headers['access-control-allow-headers'], 'Content-Type');
    assert.equal(res.headers['access-control-allow-credentials'], undefined);
    assert.equal(res.body, '');
    assert.equal(fetchCalls.length, 0);
  });
}

test('POST responses also carry CORS header', async () => {
  setEnv(true);
  installFetch();
  const res = await call(feedback, { body: feedbackBody() });
  assert.equal(res.headers['access-control-allow-origin'], '*');
});

test('non-JSON content type -> 400', async () => {
  setEnv(true);
  installFetch();
  const res = await call(feedback, { raw: JSON.stringify(feedbackBody()), contentType: 'text/plain' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_content_type');
});

// ---- Success ---------------------------------------------------------------

test('feedback success -> 200 {"ok":true}, correct Supabase request', async () => {
  setEnv(true);
  installFetch({ count: 0 });
  const res = await call(feedback, { body: feedbackBody() });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '{"ok":true}');
  const head = fetchCalls.find((c) => c.method === 'HEAD');
  assert.ok(head.url.startsWith(`${FAKE_URL}/rest/v1/playtest_feedback?`));
  assert.ok(head.url.includes(`installation_id=eq.${IDS.installation_id}`));
  assert.ok(head.url.includes('created_at=gte.'));
  const ins = insertCall();
  assert.equal(ins.url, `${FAKE_URL}/rest/v1/playtest_feedback`);
  assert.equal(ins.headers.apikey, FAKE_KEY);
  assert.equal(ins.headers.Authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(ins.headers.Prefer, 'return=minimal');
  const [row] = insertedRows();
  assert.equal(row.rating, 4);
  assert.equal(row.would_wishlist, 'maybe');
  assert.equal(row.understood_fish, null);
  assert.equal(row.profile, 'playtest');
  assert.equal(row.enjoyed_most, 'Opening packs');
});

test('feedback via raw stream body (no Vercel helper) succeeds', async () => {
  setEnv(true);
  installFetch();
  const res = await call(feedback, { raw: JSON.stringify(feedbackBody()) });
  assert.equal(res.statusCode, 200);
  assert.equal(insertedRows().length, 1);
});

test('bug-report success; minimal context (technical context off) accepted', async () => {
  setEnv(true);
  installFetch();
  const res = await call(bugReport, {
    body: bugBody({
      day: null, weekday: null, current_screen: null, active_quest: null,
      session_seconds: null, resolution: null, display_mode: null,
      recent_events: null, recent_errors: null,
    }),
  });
  assert.equal(res.statusCode, 200);
  const [row] = insertedRows();
  assert.equal(row.recent_events, null);
  assert.equal(row.day, null);
  assert.equal(row.title, 'Card vanished');
});

test('bug-report success keeps sanitized recent_events/errors', async () => {
  setEnv(true);
  installFetch();
  const res = await call(bugReport, { body: bugBody() });
  assert.equal(res.statusCode, 200);
  const [row] = insertedRows();
  assert.deepEqual(row.recent_events, [
    { name: 'duel_end', at: '2026-09-27T10:00:00.000Z', properties: { won: true, turns: 7 } },
  ]);
  assert.equal(row.recent_errors[0].source, 'duel.js:42');
});

test('events success -> one row per event, identity copied', async () => {
  setEnv(true);
  installFetch();
  const res = await call(events, { body: eventsBody(3) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '{"ok":true}');
  const rows = insertedRows();
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.equal(r.installation_id, IDS.installation_id);
    assert.equal(r.event_name, 'pack_opened');
    assert.equal(r.locale, 'tr');
    assert.deepEqual(r.properties, { pack_id: 'base', cost: 100, rare: false, extra: null });
  }
  assert.ok(insertCall().url.endsWith('/rest/v1/playtest_events'));
});

// ---- Validation ------------------------------------------------------------

const badFeedback = [
  ['rating 0', { rating: 0 }, 'invalid_rating'],
  ['rating 6', { rating: 6 }, 'invalid_rating'],
  ['rating 3.5', { rating: 3.5 }, 'invalid_rating'],
  ['rating "5"', { rating: '5' }, 'invalid_rating'],
  ['rating missing', { rating: undefined }, 'invalid_rating'],
  ['wishlist "sure"', { would_wishlist: 'sure' }, 'invalid_would_wishlist'],
  ['wishlist "YES"', { would_wishlist: 'YES' }, 'invalid_would_wishlist'],
  ['wishlist missing', { would_wishlist: undefined }, 'invalid_would_wishlist'],
  ['oversized enjoyed_most', { enjoyed_most: 'x'.repeat(3001) }, 'enjoyed_most_too_long'],
  ['oversized anything_else', { anything_else: 'y'.repeat(3001) }, 'anything_else_too_long'],
  ['profile full', { profile: 'full' }, 'invalid_profile'],
  ['bad installation_id', { installation_id: 'not-a-uuid' }, 'invalid_installation_id'],
  ['bad session_id', { session_id: '12345' }, 'invalid_session_id'],
  ['bad version', { version: 'v1' }, 'invalid_version'],
  ['locale too long', { locale: 'x'.repeat(17) }, 'locale_too_long'],
  ['day negative', { day: -1 }, 'invalid_day'],
  ['bool as string', { understood_duel: 'yes' }, 'invalid_understood_duel'],
];
for (const [label, patch, code] of badFeedback) {
  test(`feedback rejects ${label} -> 400 ${code}`, async () => {
    setEnv(true);
    installFetch();
    const res = await call(feedback, { body: feedbackBody(patch) });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { ok: false, error: code });
    assert.equal(insertCall(), undefined, 'gecersiz govdede insert yapilmamali');
  });
}

test('feedback accepts exactly 3000-char text (boundary)', async () => {
  setEnv(true);
  installFetch();
  const res = await call(feedback, { body: feedbackBody({ confusing: 'z'.repeat(3000) }) });
  assert.equal(res.statusCode, 200);
});

const badBug = [
  ['empty title', { title: '   ' }, 'invalid_title'],
  ['title 121', { title: 't'.repeat(121) }, 'title_too_long'],
  ['empty what_happened', { what_happened: '' }, 'invalid_what_happened'],
  ['oversized steps', { steps_to_reproduce: 's'.repeat(3001) }, 'steps_to_reproduce_too_long'],
  ['11 recent_events', {
    recent_events: Array.from({ length: 11 }, () => ({ name: 'a', at: '2026-09-27T10:00:00Z', properties: {} })),
  }, 'too_many_recent_events'],
  ['11 recent_errors', {
    recent_errors: Array.from({ length: 11 }, () => ({ message: 'm', source: null, at: '2026-09-27T10:00:00Z' })),
  }, 'too_many_recent_errors'],
  ['recent_error bad time', { recent_errors: [{ message: 'm', source: null, at: 'yesterday' }] }, 'invalid_recent_errors'],
];
for (const [label, patch, code] of badBug) {
  test(`bug-report rejects ${label} -> 400 ${code}`, async () => {
    setEnv(true);
    installFetch();
    const res = await call(bugReport, { body: bugBody(patch) });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { ok: false, error: code });
    assert.equal(insertCall(), undefined);
  });
}

test('events batch of 50 accepted, 51 rejected', async () => {
  setEnv(true);
  installFetch();
  let res = await call(events, { body: eventsBody(50) });
  assert.equal(res.statusCode, 200);
  assert.equal(insertedRows().length, 50);
  installFetch();
  res = await call(events, { body: eventsBody(51) });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { ok: false, error: 'too_many_events' });
  assert.equal(insertCall(), undefined);
});

test('events empty batch rejected', async () => {
  setEnv(true);
  installFetch();
  const res = await call(events, { body: eventsBody(0) });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_events');
});

for (const bad of ['Pack_Opened', 'pack-opened', '', 'a'.repeat(65), 'drop table;']) {
  test(`events rejects event_name ${JSON.stringify(bad).slice(0, 24)}`, async () => {
    setEnv(true);
    installFetch();
    const body = eventsBody(2);
    body.events[1].event_name = bad;
    const res = await call(events, { body });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, 'invalid_event_name');
    assert.equal(insertCall(), undefined);
  });
}

const badProps = [
  ['nested object', { a: { b: 1 } }, 'invalid_property_value'],
  ['array value', { a: [1] }, 'invalid_property_value'],
  ['bad key', { 'Bad-Key': 1 }, 'invalid_property_key'],
  ['21 keys', Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])), 'too_many_properties'],
  ['string 201', { s: 'x'.repeat(201) }, 'property_value_too_long'],
  ['> 2048 bytes', Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`key_${i}`, 'x'.repeat(190)])), 'properties_too_large'],
];
for (const [label, props, code] of badProps) {
  test(`events rejects properties: ${label}`, async () => {
    setEnv(true);
    installFetch();
    const body = eventsBody(1);
    body.events[0].properties = props;
    const res = await call(events, { body });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, code);
  });
}

test('events rejects __proto__ property key', async () => {
  setEnv(true);
  installFetch();
  const body = JSON.parse(JSON.stringify(eventsBody(1)).replace('"pack_id"', '"__proto__"'));
  const res = await call(events, { body });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_property_key');
});

test('events rejects bad occurred_at', async () => {
  setEnv(true);
  installFetch();
  const body = eventsBody(1);
  body.events[0].occurred_at = '27/09/2026';
  const res = await call(events, { body });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_occurred_at');
});

test('invalid JSON / non-object bodies -> 400', async () => {
  setEnv(true);
  installFetch();
  let res = await call(feedback, { raw: '{not json' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_json');
  res = await call(feedback, { body: [1, 2] });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_body');
  res = await call(feedback, { raw: 'null' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_body');
});

// ---- Body size -------------------------------------------------------------

test('feedback body > 32 KB -> 413 (declared content-length)', async () => {
  setEnv(true);
  installFetch();
  const res = await call(feedback, { body: feedbackBody(), headers: { 'content-length': String(32 * 1024 + 1) } });
  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.json(), { ok: false, error: 'payload_too_large' });
  assert.equal(fetchCalls.length, 0);
});

test('feedback body > 32 KB -> 413 (stream, no content-length)', async () => {
  setEnv(true);
  installFetch();
  const raw = JSON.stringify(feedbackBody({ padding: 'p'.repeat(40 * 1024) }));
  const res = await call(feedback, { raw, headers: { 'content-length': 'unknown' } });
  assert.equal(res.statusCode, 413);
});

test('feedback body > 32 KB -> 413 (pre-parsed body)', async () => {
  setEnv(true);
  installFetch();
  const res = await call(feedback, { body: feedbackBody({ padding: 'p'.repeat(40 * 1024) }) });
  assert.equal(res.statusCode, 413);
});

test('events allows up to 64 KB, rejects above', async () => {
  setEnv(true);
  installFetch();
  const ok = await call(events, { body: eventsBody(2), headers: { 'content-length': String(64 * 1024) } });
  assert.equal(ok.statusCode, 200);
  installFetch();
  const big = await call(events, { body: eventsBody(2), headers: { 'content-length': String(64 * 1024 + 1) } });
  assert.equal(big.statusCode, 413);
});

// ---- Whitelist / privacy ---------------------------------------------------

test('unknown top-level and event fields are dropped from the insert', async () => {
  setEnv(true);
  installFetch();
  let res = await call(feedback, {
    body: feedbackBody({ ip: '1.2.3.4', steam_id: '7656119', email: 'a@b.c', id: 'x', status: 'fixed', created_at: '2000-01-01T00:00:00Z' }),
  });
  assert.equal(res.statusCode, 200);
  const [row] = insertedRows();
  for (const k of ['ip', 'steam_id', 'email', 'id', 'status', 'created_at', 'developer_note']) {
    assert.ok(!(k in row), `${k} insert'e girmemeli`);
  }
  assert.deepEqual(Object.keys(row).sort(), [
    'active_quest', 'anything_else', 'confusing', 'current_screen', 'day', 'display_mode', 'enjoyed_most',
    'installation_id', 'locale', 'profile', 'rating', 'resolution', 'session_id', 'session_seconds',
    'understood_build_deck', 'understood_duel', 'understood_earn_money', 'understood_farm', 'understood_fish',
    'understood_open_packs', 'unknown_how_to', 'version', 'weekday', 'would_wishlist',
  ]);

  installFetch();
  const body = eventsBody(1, { user_name: 'bob' });
  body.events[0].secret = 'zzz';
  res = await call(events, { body });
  assert.equal(res.statusCode, 200);
  const [ev] = insertedRows();
  assert.ok(!('user_name' in ev) && !('secret' in ev));
  assert.deepEqual(Object.keys(ev).sort(), [
    'current_screen', 'event_name', 'installation_id', 'locale', 'occurred_at', 'play_day',
    'profile', 'properties', 'session_id', 'version', 'weekday',
  ]);

  installFetch();
  const bug = bugBody();
  bug.recent_errors[0].stack = '/home/user/secret/path.js';
  bug.recent_events[0].extra = 1;
  res = await call(bugReport, { body: bug });
  assert.equal(res.statusCode, 200);
  const [br] = insertedRows();
  assert.deepEqual(Object.keys(br.recent_errors[0]).sort(), ['at', 'message', 'source']);
  assert.deepEqual(Object.keys(br.recent_events[0]).sort(), ['at', 'name', 'properties']);
});

test('inserted rows contain no ip/header data even when request carries them', async () => {
  setEnv(true);
  installFetch();
  const req = mockReq({
    body: feedbackBody(),
    headers: { 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9', 'user-agent': 'UA-Probe/1.0', cookie: 'c=1' },
  });
  req.socket = { remoteAddress: '203.0.113.9' };
  const res = mockRes();
  await feedback(req, res);
  await res.done;
  assert.equal(res.statusCode, 200);
  const raw = insertCall().body;
  for (const needle of ['203.0.113.9', 'UA-Probe', 'x-forwarded-for', 'user_agent', 'user-agent', 'cookie', '"ip"', 'headers']) {
    assert.ok(!raw.includes(needle), `insert govdesi ${needle} icermemeli`);
  }
  for (const c of fetchCalls) assert.ok(!c.url.includes('203.0.113.9'));
});

// ---- Rate limit ------------------------------------------------------------

test('feedback: 5 in last hour -> 429, no insert', async () => {
  setEnv(true);
  installFetch({ count: 5 });
  const res = await call(feedback, { body: feedbackBody() });
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.json(), { ok: false, error: 'rate_limited' });
  assert.equal(res.headers['retry-after'], '3600');
  assert.equal(insertCall(), undefined);
});

test('feedback: 4 in last hour -> allowed', async () => {
  setEnv(true);
  installFetch({ count: 4 });
  const res = await call(feedback, { body: feedbackBody() });
  assert.equal(res.statusCode, 200);
});

test('bug-report: 10 in last hour -> 429', async () => {
  setEnv(true);
  installFetch({ count: 10 });
  const res = await call(bugReport, { body: bugBody() });
  assert.equal(res.statusCode, 429);
});

test('events: window full (1500 rows / 10 min) -> 429; batch that would overflow -> 429', async () => {
  setEnv(true);
  installFetch({ count: 1500 });
  let res = await call(events, { body: eventsBody(1) });
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], '600');
  installFetch({ count: 1460 });
  res = await call(events, { body: eventsBody(50) });
  assert.equal(res.statusCode, 429);
  installFetch({ count: 1450 });
  res = await call(events, { body: eventsBody(50) });
  assert.equal(res.statusCode, 200);
});

// ---- Server errors / secret hygiene ----------------------------------------

test('missing env -> 500 server_error, no secret or env name leaked', async () => {
  setEnv(false);
  installFetch();
  consoleLines = [];
  const res = await call(feedback, { body: feedbackBody() });
  assert.equal(res.statusCode, 500);
  assert.equal(res.body, '{"ok":false,"error":"server_error"}');
  assert.equal(fetchCalls.length, 0);
  assert.ok(!res.body.includes('SUPABASE'));
});

test('only URL set (key missing) -> 500', async () => {
  setEnv(false);
  process.env.SUPABASE_URL = FAKE_URL;
  installFetch();
  const res = await call(events, { body: eventsBody(1) });
  assert.equal(res.statusCode, 500);
  assert.equal(fetchCalls.length, 0);
});

test('DB insert failure -> 500 without echoing DB error or key', async () => {
  setEnv(true);
  installFetch({ insertStatus: 409, insertBody: '{"message":"duplicate key violates playtest_feedback_pkey"}' });
  consoleLines = [];
  const res = await call(feedback, { body: feedbackBody() });
  assert.equal(res.statusCode, 500);
  assert.equal(res.body, '{"ok":false,"error":"server_error"}');
  const logs = consoleLines.join('\n');
  assert.ok(!logs.includes(FAKE_KEY), 'log key icermemeli');
  assert.ok(!logs.includes('duplicate key'), 'log DB govdesi icermemeli');
  assert.ok(!res.body.includes(FAKE_KEY));
});

test('rate-limit count failure -> 500 (fail closed), no insert', async () => {
  setEnv(true);
  installFetch({ countStatus: 503 });
  const res = await call(bugReport, { body: bugBody() });
  assert.equal(res.statusCode, 500);
  assert.equal(insertCall(), undefined);
});

test('network failure -> 500', async () => {
  setEnv(true);
  globalThis.fetch = async () => {
    throw new Error(`connect ECONNREFUSED ${FAKE_KEY}`);
  };
  consoleLines = [];
  const res = await call(events, { body: eventsBody(1) });
  assert.equal(res.statusCode, 500);
  assert.ok(!consoleLines.join('\n').includes(FAKE_KEY));
});

// ---- Static checks ---------------------------------------------------------

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.vercel') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const THIS_FILE = fileURLToPath(import.meta.url);
const TEXT_EXT = /\.(js|mjs|cjs|ts|html|htm|css|json|yml|yaml|sql|md|txt|toml)$|(^|[\\/])\.env[^\\/]*$/i;

test('static: service role key is read only inside api/ (and only in api/_lib/supabase.js)', () => {
  const files = walk(ROOT).filter((p) => TEXT_EXT.test(p));
  const codeRefs = [];
  for (const p of files) {
    if (p === THIS_FILE) continue;
    const rel = relative(ROOT, p).split(sep).join('/');
    const text = readFileSync(p, 'utf8');
    if (!text.includes('SUPABASE_SERVICE_ROLE_KEY')) continue;
    // Dokuman ve .env.example yalniz degisken ADINI tasiyabilir.
    if (rel === '.env.example' || rel.startsWith('docs/')) continue;
    codeRefs.push(rel);
  }
  assert.deepEqual(codeRefs, ['api/_lib/supabase.js']);
  const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
  for (const line of example.split(/\r?\n/).filter(Boolean)) {
    assert.match(line, /^[A-Z_]+=$/, '.env.example deger icermemeli');
  }
});

test('static: no secret-looking literals anywhere in the repo', () => {
  const files = walk(ROOT).filter((p) => TEXT_EXT.test(p) && p !== THIS_FILE);
  for (const p of files) {
    const text = readFileSync(p, 'utf8');
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(text), `${p} JWT benzeri deger iceriyor`);
    assert.ok(!/sb_secret_[A-Za-z0-9_-]{8,}/.test(text), `${p} sb_secret anahtari iceriyor`);
  }
});

test('static: .gitignore ignores .env files but keeps .env.example', () => {
  const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert.ok(gi.includes('.env'));
  assert.ok(gi.includes('.env.*'));
  assert.ok(gi.includes('!.env.example'));
});

test('static: migration enables RLS on all tables, creates no policies, revokes anon/authenticated', () => {
  const dir = join(ROOT, 'supabase', 'migrations');
  const migs = readdirSync(dir).filter((f) => /^\d{14}_playtest_feedback\.sql$/.test(f));
  assert.equal(migs.length, 1);
  const sql = readFileSync(join(dir, migs[0]), 'utf8').replace(/--.*$/gm, '').toLowerCase();
  assert.ok(!/create\s+policy/.test(sql), 'policy olusturulmamali');
  assert.ok(!/grant[^;]*\bto\s+(anon|authenticated|public)\b/.test(sql), 'anon/authenticated/public grant olmamali');
  for (const t of ['playtest_feedback', 'playtest_bug_reports', 'playtest_events']) {
    assert.ok(new RegExp(`create table if not exists public\\.${t}\\b`).test(sql), `${t} tablosu`);
    assert.ok(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql), `${t} RLS`);
    assert.ok(new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated`).test(sql), `${t} revoke`);
    for (const col of ['version', 'installation_id', 'session_id', 'created_at']) {
      assert.ok(new RegExp(`on public\\.${t} \\(${col}\\b`).test(sql), `${t}.${col} index`);
    }
  }
  assert.ok(/on public\.playtest_events \(event_name\)/.test(sql));
  assert.ok(/on public\.playtest_feedback \(status\)/.test(sql));
  assert.ok(/on public\.playtest_bug_reports \(status\)/.test(sql));
  assert.ok(/rating between 1 and 5/.test(sql));
  assert.ok(/would_wishlist in \('yes', 'maybe', 'no'\)/.test(sql));
  assert.equal((sql.match(/status in \('new', 'reviewing', 'planned', 'fixed', 'wont_fix'\)/g) || []).length, 2);
  assert.ok(!/\bip\b|ip_address|user_agent|steam_id|email/.test(sql), 'kisisel veri kolonu olmamali');
});

test('static: static site untouched by function routing (no vercel.json rewrites of index.html)', () => {
  const files = readdirSync(ROOT);
  assert.ok(files.includes('index.html'));
  assert.ok(files.includes('style.css'));
  if (files.includes('vercel.json')) {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    assert.ok(!cfg.rewrites && !cfg.routes, 'vercel.json statik siteyi yeniden yonlendirmemeli');
  }
});

// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    process.stdout.write(`ok   ${t.name}\n`);
  } catch (err) {
    failed++;
    process.stdout.write(`FAIL ${t.name}\n     ${err && err.message}\n`);
  }
}
console.error = origError;
process.stdout.write(`\n${passed} passed, ${failed} failed, ${tests.length} total\n`);
process.exit(failed ? 1 : 0);

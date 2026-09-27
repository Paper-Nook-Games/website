'use strict';

// POST /api/playtest/events - anonim Playtest telemetri batch'i (1..50 event).
// Sozlesme ve gizlilik siniri: api/_lib/validate.js, docs/PLAYTEST_BACKEND.md

const { createPlaytestHandler } = require('../_lib/handler');
const { validateEvents } = require('../_lib/validate');
const { BODY_LIMITS, RATE_LIMITS, TABLES } = require('../_lib/config');

module.exports = createPlaytestHandler({
  name: 'events',
  table: TABLES.events,
  maxBytes: BODY_LIMITS.events,
  rateLimit: RATE_LIMITS.events,
  validate: validateEvents,
});

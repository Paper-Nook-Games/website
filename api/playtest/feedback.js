'use strict';

// POST /api/playtest/feedback - Playtest geri bildirim formu.
// Sozlesme ve gizlilik siniri: api/_lib/validate.js, docs/PLAYTEST_BACKEND.md

const { createPlaytestHandler } = require('../_lib/handler');
const { validateFeedback } = require('../_lib/validate');
const { BODY_LIMITS, RATE_LIMITS, TABLES } = require('../_lib/config');

module.exports = createPlaytestHandler({
  name: 'feedback',
  table: TABLES.feedback,
  maxBytes: BODY_LIMITS.feedback,
  rateLimit: RATE_LIMITS.feedback,
  validate: validateFeedback,
});

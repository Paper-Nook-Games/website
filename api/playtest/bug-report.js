'use strict';

// POST /api/playtest/bug-report - Playtest hata raporu.
// Sozlesme ve gizlilik siniri: api/_lib/validate.js, docs/PLAYTEST_BACKEND.md

const { createPlaytestHandler } = require('../_lib/handler');
const { validateBugReport } = require('../_lib/validate');
const { BODY_LIMITS, RATE_LIMITS, TABLES } = require('../_lib/config');

module.exports = createPlaytestHandler({
  name: 'bug-report',
  table: TABLES.bugReport,
  maxBytes: BODY_LIMITS.bugReport,
  rateLimit: RATE_LIMITS.bugReport,
  validate: validateBugReport,
});

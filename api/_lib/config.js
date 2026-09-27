'use strict';

// Playtest API sabitleri. Oyun istemcisiyle paylasilan sozlesme:
// payload alanlari/limitleri burada degisirse oyun tarafindaki istemci de guncellenmeli.

const KB = 1024;

const BODY_LIMITS = {
  feedback: 32 * KB,
  bugReport: 32 * KB,
  events: 64 * KB,
};

const LIMITS = {
  text: 3000, // feedback/bug serbest metin alanlari
  title: 120,
  locale: 16,
  weekday: 16,
  currentScreen: 64,
  activeQuest: 120,
  resolution: 32,
  displayMode: 32,
  maxDay: 10000,
  maxSessionSeconds: 604800,
  recentItems: 10, // recent_events / recent_errors
  recentEventName: 64,
  recentErrorMessage: 500,
  recentErrorSource: 200,
  eventsPerBatch: 50,
  eventName: 64,
  propertyKeys: 20,
  propertyString: 200,
  propertyBytes: 2048,
  isoLength: 40,
};

// Rate limit: installation_id basina, Supabase'deki son pencere satir sayisi ile.
// IP hicbir yerde saklanmaz/kullanilmaz. Olay limiti satir (event) cinsindendir:
// 30 dolu batch x 50 event = 1500 event / 10 dk.
const RATE_LIMITS = {
  feedback: { windowMs: 60 * 60 * 1000, maxRows: 5 },
  bugReport: { windowMs: 60 * 60 * 1000, maxRows: 10 },
  events: { windowMs: 10 * 60 * 1000, maxRows: 30 * 50 },
};

const TABLES = {
  feedback: 'playtest_feedback',
  bugReport: 'playtest_bug_reports',
  events: 'playtest_events',
};

const SUPABASE_TIMEOUT_MS = 8000;

module.exports = { BODY_LIMITS, LIMITS, RATE_LIMITS, TABLES, SUPABASE_TIMEOUT_MS };

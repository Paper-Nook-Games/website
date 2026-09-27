'use strict';

// Ortak Playtest endpoint akisi:
// CORS/preflight -> yalniz POST -> Content-Type -> govde boyutu -> whitelist dogrulama
// -> env -> installation_id rate limit -> Supabase insert -> {"ok":true}.
// Hata yanitlari yalniz kisa bir kod tasir; DB/secret detayi asla donmez.
// Gizlilik: istek IP'si ve header'lari hicbir satira yazilmaz.

const { ValidationError } = require('./validate');
const { getSupabaseEnv, countRecentRows, insertRows } = require('./supabase');

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

class BodyError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function isJsonContentType(req) {
  const ct = String((req.headers && req.headers['content-type']) || '').toLowerCase();
  return ct.split(';')[0].trim() === 'application/json';
}

function readStream(req, maxBytes) {
  return new Promise((resolve, reject) => {
    if (req.readableEnded || typeof req.on !== 'function') {
      resolve('');
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        reject(new BodyError(413, 'payload_too_large'));
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => {
      if (done) return;
      done = true;
      reject(new BodyError(400, 'invalid_body'));
    });
  });
}

async function readJsonBody(req, maxBytes) {
  const declared = Number(req.headers && req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyError(413, 'payload_too_large');

  // Vercel Node helper'lari req.body'yi onceden parse eder (gecersiz JSON'da getter firlatir).
  let pre;
  try {
    pre = req.body;
  } catch (_) {
    throw new BodyError(400, 'invalid_json');
  }

  let raw;
  if (pre === undefined) raw = await readStream(req, maxBytes);
  else if (Buffer.isBuffer(pre)) raw = pre.toString('utf8');
  else if (typeof pre === 'string') raw = pre;
  else {
    const size = Buffer.byteLength(JSON.stringify(pre) || '', 'utf8');
    if (size > maxBytes) throw new BodyError(413, 'payload_too_large');
    return pre;
  }

  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new BodyError(413, 'payload_too_large');
  if (!raw.trim()) throw new BodyError(400, 'invalid_json');
  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new BodyError(400, 'invalid_json');
  }
}

/**
 * @param {{name:string, table:string, maxBytes:number, validate:Function,
 *          rateLimit:{windowMs:number, maxRows:number}}} opts
 */
function createPlaytestHandler(opts) {
  return async function handler(req, res) {
    setCommonHeaders(res);

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Max-Age', '86400');
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }
    if (!isJsonContentType(req)) {
      sendJson(res, 400, { ok: false, error: 'invalid_content_type' });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req, opts.maxBytes);
    } catch (err) {
      if (err instanceof BodyError) sendJson(res, err.status, { ok: false, error: err.code });
      else sendJson(res, 400, { ok: false, error: 'invalid_body' });
      return;
    }

    let result;
    try {
      result = opts.validate(body);
    } catch (err) {
      if (err instanceof ValidationError) sendJson(res, 400, { ok: false, error: err.code });
      else sendJson(res, 400, { ok: false, error: 'invalid_body' });
      return;
    }

    const env = getSupabaseEnv();
    if (!env) {
      console.error(`[playtest:${opts.name}] storage not configured`);
      sendJson(res, 500, { ok: false, error: 'server_error' });
      return;
    }

    try {
      const { windowMs, maxRows } = opts.rateLimit;
      const recent = await countRecentRows(env, opts.table, result.installationId, windowMs);
      if (recent + result.rows.length > maxRows) {
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        sendJson(res, 429, { ok: false, error: 'rate_limited' });
        return;
      }
      await insertRows(env, opts.table, result.rows);
    } catch (err) {
      // Yalniz asama + HTTP status loglanir; DB govdesi/secret asla.
      console.error(`[playtest:${opts.name}] storage error`, err && err.stage, err && err.status);
      sendJson(res, 500, { ok: false, error: 'server_error' });
      return;
    }

    sendJson(res, 200, { ok: true });
  };
}

module.exports = { createPlaytestHandler, readJsonBody };

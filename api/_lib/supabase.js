'use strict';

// Supabase REST (PostgREST) erisimi - yalniz sunucu tarafi.
// SUPABASE_SERVICE_ROLE_KEY sadece bu dosyada okunur; hicbir response'a, log'a
// veya istemci koduna gecmez. DB hata govdeleri okunmaz/loglanmaz.

const { SUPABASE_TIMEOUT_MS } = require('./config');

class StorageError extends Error {
  constructor(stage, status) {
    super(`storage_${stage}`);
    this.stage = stage;
    this.status = status || 0;
  }
}

function getSupabaseEnv() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key || !/^https?:\/\//i.test(url)) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

function authHeaders(env) {
  return { apikey: env.key, Authorization: `Bearer ${env.key}` };
}

function timeoutSignal() {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(SUPABASE_TIMEOUT_MS)
    : undefined;
}

// Son `windowMs` icinde bu installation_id ile yazilmis satir sayisi.
async function countRecentRows(env, table, installationId, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const qs =
    'select=id' +
    `&installation_id=eq.${encodeURIComponent(installationId)}` +
    `&created_at=gte.${encodeURIComponent(since)}`;
  let res;
  try {
    res = await fetch(`${env.url}/rest/v1/${table}?${qs}`, {
      method: 'HEAD',
      headers: { ...authHeaders(env), Prefer: 'count=exact' },
      signal: timeoutSignal(),
    });
  } catch (_) {
    throw new StorageError('count_network');
  }
  if (!res.ok) throw new StorageError('count', res.status);
  const range = (res.headers && res.headers.get('content-range')) || '';
  const m = /\/(\d+)\s*$/.exec(range);
  if (!m) throw new StorageError('count_parse', res.status);
  return Number(m[1]);
}

async function insertRows(env, table, rows) {
  let res;
  try {
    res = await fetch(`${env.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        ...authHeaders(env),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
      signal: timeoutSignal(),
    });
  } catch (_) {
    throw new StorageError('insert_network');
  }
  if (!res.ok) throw new StorageError('insert', res.status);
}

module.exports = { getSupabaseEnv, countRecentRows, insertRows, StorageError };

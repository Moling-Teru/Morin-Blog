'use strict';

const { isIP } = require('node:net');
const { loadApi } = require('./sdk');

const routes = new Map([
  ['/song/detail', { method: 'song_detail', parameter: 'ids', cacheSeconds: 300 }],
  ['/song/url', { method: 'song_url', parameter: 'id', cacheSeconds: 60 }],
  ['/lyric', { method: 'lyric', parameter: 'id', cacheSeconds: 3600 }]
]);

function sendJson(response, status, body, cacheControl = 'no-store') {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.end(JSON.stringify(body));
}

async function withinDeadline(work, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Music API timeout');
          error.code = 'MUSIC_API_TIMEOUT';
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function createHandler({ getApi = loadApi, env = process.env, timeoutMs = 20000 } = {}) {
  return async function handleMusicRequest(request, response) {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { code: 405, msg: 'Method not allowed' });
      return;
    }

    let url;
    try {
      // Vercel Services preserves the full public path. Connect may strip it locally.
      url = new URL(request.originalUrl || request.url, 'http://localhost');
    } catch {
      sendJson(response, 400, { code: 400, msg: 'Invalid request URL' });
      return;
    }
    const pathname = url.pathname.replace(/\/+$/, '');
    const prefix = '/api/netease';
    const route = pathname.startsWith(prefix + '/') ? pathname.slice(prefix.length) : pathname;

    if (route === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    const endpoint = routes.get(route);
    if (!endpoint) {
      sendJson(response, 404, { code: 404, msg: 'Not found' });
      return;
    }
    const id = url.searchParams.get(endpoint.parameter);
    if (!/^[1-9]\d{0,19}$/.test(id || '')) {
      sendJson(response, 400, { code: 400, msg: 'A valid song ID is required' });
      return;
    }
    const realIP = env.NETEASE_REAL_IP || url.searchParams.get('realIP');
    if (realIP && !isIP(realIP)) {
      sendJson(response, 400, { code: 400, msg: 'Invalid realIP' });
      return;
    }

    // Only the playback inputs reach the SDK; caller cookies and proxy options do not.
    const query = {
      [endpoint.parameter]: id,
      timeout: 10000,
      ...(realIP ? { realIP } : {})
    };
    try {
      const result = await withinDeadline(Promise.resolve().then(async () => {
        const api = await getApi();
        return api[endpoint.method](query);
      }), timeoutMs);
      const status = result.status || 200;
      if (!Number.isInteger(status) || status < 200 || status > 599 || !result.body) {
        throw new Error('Invalid music API response');
      }
      const cacheControl = status === 200 && !env.NETEASE_COOKIE
        ? `public, max-age=0, s-maxage=${endpoint.cacheSeconds}`
        : 'no-store';
      // SDK responses wrap JSON in `body`; do not forward Set-Cookie to blog visitors.
      sendJson(response, status, result.body, cacheControl);
    } catch (error) {
      const timeout = error.code === 'MUSIC_API_TIMEOUT' || error.code === 'ECONNABORTED';
      sendJson(response, timeout ? 504 : 502, {
        code: timeout ? 504 : 502,
        msg: timeout ? 'Music service timed out' : 'Music service temporarily unavailable'
      });
    }
  };
}

module.exports = { createHandler };

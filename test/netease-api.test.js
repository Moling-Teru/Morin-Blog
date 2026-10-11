'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { createHandler } = require('../services/netease-api/handler');

async function start(t, options) {
  const server = createServer(createHandler(options));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('same-site routes unwrap SDK responses into the JSON expected by the player', async (t) => {
  const calls = [];
  const sdk = Object.fromEntries(['song_detail', 'song_url', 'lyric'].map((method) => [method, async (query) => {
    calls.push({ method, query });
    return { status: 200, body: { code: 200, endpoint: method }, cookie: ['private=value'] };
  }]));
  const base = await start(t, { getApi: () => sdk, env: {} });
  for (const [route, parameter, method] of [
    ['song/detail', 'ids', 'song_detail'], ['song/url', 'id', 'song_url'], ['lyric', 'id', 'lyric']
  ]) {
    const response = await fetch(`${base}/api/netease/${route}?${parameter}=536622304`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { code: 200, endpoint: method });
    assert.equal(response.headers.get('set-cookie'), null);
    assert.match(response.headers.get('cache-control'), /s-maxage=/);
  }
  assert.deepEqual(calls.map((call) => call.method), ['song_detail', 'song_url', 'lyric']);
  assert.equal(calls[0].query.ids, '536622304');
  assert.equal(calls[1].query.id, '536622304');
});

test('health, unknown endpoints, methods and invalid parameters do not load the SDK', async (t) => {
  let loaded = 0;
  const base = await start(t, { getApi: () => { loaded++; throw new Error('Must not load'); } });
  const health = await fetch(base + '/api/netease/health');
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  for (const route of ['/api/netease/login', '/api/netease/song/url/v1', '/api/neteaseevil/song/url']) {
    const response = await fetch(base + route + '?id=1');
    assert.equal(response.status, 404);
  }
  for (const id of ['', '0', '-1', 'abc', '1,2', '1<script>', '1'.repeat(21)]) {
    const response = await fetch(base + '/api/netease/song/url?id=' + encodeURIComponent(id));
    assert.equal(response.status, 400, id);
  }
  const invalidIP = await fetch(base + '/api/netease/song/url?id=1&realIP=not-an-ip');
  assert.equal(invalidIP.status, 400);
  const post = await fetch(base + '/api/netease/song/url?id=1', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET');
  assert.equal(loaded, 0);
});

test('query parameters cannot inject SDK cookie, proxy or other options', async (t) => {
  let received;
  const base = await start(t, { env: {}, getApi: () => ({ song_url: async (query) => {
    received = query;
    return { status: 200, body: { data: [{ url: null }] } };
  } }) });
  const response = await fetch(base + '/api/netease/song/url?id=1&realIP=116.25.146.177&cookie=secret&proxy=http://example.test&crypto=evil&timeout=999999', {
    headers: { cookie: 'session=visitor-cookie' }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { id: '1', timeout: 10000, realIP: '116.25.146.177' });
});

test('server IP configuration takes precedence and account responses are not publicly cached', async (t) => {
  let received;
  const base = await start(t, {
    env: { NETEASE_REAL_IP: '203.0.113.1', NETEASE_COOKIE: 'server-secret' },
    getApi: () => ({ song_url: async (query) => {
      received = query;
      return { status: 200, body: { data: [{ url: 'https://example.test/song.mp3' }] } };
    } })
  });
  const response = await fetch(base + '/api/netease/song/url?id=1&realIP=116.25.146.177');
  assert.equal(received.realIP, '203.0.113.1');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(JSON.stringify(await response.json()).includes('server-secret'), false);
});

test('Connect-mounted URLs and Vercel full paths both resolve the same endpoint', async (t) => {
  const sdk = { song_detail: async (query) => ({ status: 200, body: { songs: [{ id: query.ids }] } }) };
  const base = await start(t, { env: {}, getApi: () => sdk });
  const response = await fetch(base + '/song/detail/?ids=123');
  assert.deepEqual(await response.json(), { songs: [{ id: '123' }] });
});

test('upstream failures produce JSON without exposing internal errors', async (t) => {
  const base = await start(t, { getApi: () => { throw new Error('secret internal details'); } });
  const response = await fetch(base + '/api/netease/song/url?id=1');
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { code: 502, msg: 'Music service temporarily unavailable' });
});

test('slow upstream calls finish with a gateway timeout', async (t) => {
  const base = await start(t, {
    timeoutMs: 30,
    getApi: () => ({ song_url: () => new Promise(() => {}) })
  });
  const response = await fetch(base + '/api/netease/song/url?id=1');
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { code: 504, msg: 'Music service timed out' });
});

'use strict';

const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { createRequire } = require('node:module');
const Hexo = require('hexo');
const { register, generateAssets } = require('../lib/netease-music');
// Use the DOM implementation already required by our Markdown renderer.
const { JSDOM } = createRequire(require.resolve('hexo-renderer-marked'))('jsdom');

let hexo;
before(async () => {
  hexo = new Hexo(process.cwd(), { silent: true });
  await hexo.loadPlugin(require.resolve('hexo-renderer-marked'));
  register(hexo);
});

function render(markdown, config = {}) {
  hexo.config.root = config.root || '/';
  hexo.config.url = 'https://example.test';
  hexo.config.netease_music = { api: config.api || '', real_ip: config.real_ip || '' };
  return hexo.render.renderSync({ text: markdown, engine: 'md' });
}

function frames(markdown, config) {
  return new JSDOM(render(markdown, config)).window.document.querySelectorAll('iframe');
}

test('the requested syntax generates a same-site iframe with a string ID', () => {
  const [frame] = frames('!:[wyy_music_id=536622304]');
  assert.equal(frame.getAttribute('src'), '/music-player/index.html?id=536622304');
  assert.equal(frame.title, '网易云音乐播放器 536622304');
  assert.equal(frame.getAttribute('loading'), 'lazy');
  assert.equal(frame.hasAttribute('allow'), false);
  assert.equal(frames('!:[wyy_music_id=9007199254740993]')[0].getAttribute('src'),
    '/music-player/index.html?id=9007199254740993');
});

test('multiple markers work in prose, lists and quotes', () => {
  const html = render('分享 !:[wyy_music_id=1] 这首歌\n\n- !:[wyy_music_id=2]\n\n> !:[wyy_music_id=3]');
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll('iframe').length, 3);
  assert.ok(document.querySelector('li iframe'));
  assert.ok(document.querySelector('blockquote iframe'));
  assert.match(document.body.textContent, /分享/);
});

test('code examples and escaped markers remain literal text', () => {
  const marker = '!:[wyy_music_id=536622304]';
  const examples = [
    '`' + marker + '`',
    '```md\n' + marker + '\n```',
    '    ' + marker,
    '<code>' + marker + '</code>',
    '<pre>' + marker + '</pre>',
    '\\' + marker
  ];
  for (const markdown of examples) {
    assert.equal(frames(markdown).length, 0, markdown);
    assert.ok(render(markdown).includes('wyy_music_id'), markdown);
  }
});

test('invalid IDs and attribute injection do not produce players', () => {
  for (const id of ['{id}', '', '0', '-1', '1.5', 'abc', '1&api=evil', '1" onload="alert(1)']) {
    assert.equal(frames(`!:[wyy_music_id=${id}]`).length, 0, id);
  }
});

test('subdirectory deployments and API parameters are encoded correctly', () => {
  const api = 'https://api.example.test/music/?name="&other=<value>';
  const [frame] = frames('!:[wyy_music_id=123]', { root: '/blog/', api });
  const url = new URL(frame.getAttribute('src'), 'https://example.test');
  assert.equal(url.pathname, '/blog/music-player/index.html');
  assert.equal(url.searchParams.get('id'), '123');
  assert.equal(url.searchParams.get('api'), api);
  assert.equal(frame.attributes.length, 7);
});

test('the reference API realIP option is passed to the local player', () => {
  const [frame] = frames('!:[wyy_music_id=123]', {
    api: 'https://api.example.test/', real_ip: '116.25.146.177'
  });
  const url = new URL(frame.getAttribute('src'), 'https://example.test');
  assert.equal(url.searchParams.get('real_ip'), '116.25.146.177');
});

test('generator provides standalone HTML, CSS and JS without remote assets', async () => {
  const assets = await hexo.extend.generator.get('netease-music-player')();
  assert.deepEqual(assets.map((asset) => asset.path), [
    'music-player/index.html', 'music-player/player.css', 'music-player/player.js'
  ]);
  const document = new JSDOM(assets[0].data).window.document;
  assert.equal(document.querySelector('script').getAttribute('src'), './player.js');
  assert.equal(document.querySelector('link').getAttribute('href'), './player.css');
  assert.equal(document.querySelector('audio').getAttribute('preload'), 'none');
  assert.equal(document.querySelector('audio').autoplay, false);
  assert.equal(document.querySelector('audio').loop, true);
  assert.ok(!assets.some((asset) => /github\.io|nmapi\.dontpanic/.test(asset.data)));
});

const assets = generateAssets();
const playerHtml = assets.find((asset) => asset.path.endsWith('index.html')).data;
const playerJs = assets.find((asset) => asset.path.endsWith('player.js')).data;

function player(query, fetchImpl = () => { throw new Error('Unexpected API request'); }) {
  const dom = new JSDOM(playerHtml, {
    url: 'https://example.test/blog/music-player/index.html?' + query,
    runScripts: 'outside-only'
  });
  const { window } = dom;
  window.fetch = fetchImpl;
  window.AbortSignal = global.AbortSignal;
  window.eval(playerJs);
  return { window, document: window.document, audio: window.document.getElementById('audio') };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('default player uses the HTTPS outer audio URL without any API request', () => {
  const { document, audio } = player('id=536622304');
  assert.equal(audio.src, 'https://music.163.com/song/media/outer/url?id=536622304.mp3');
  assert.equal(document.getElementById('song-link').href, 'https://music.163.com/#/song?id=536622304');
  assert.equal(document.getElementById('song-link').hidden, false);
  assert.equal(document.getElementById('title').textContent, '网易云音乐 · 536622304');
});

test('direct visits with invalid IDs do not load audio', () => {
  for (const id of ['', '0', '-1', 'abc', '%22%3E']) {
    const { document, audio } = player('id=' + id);
    assert.equal(audio.hasAttribute('src'), false);
    assert.equal(audio.hidden, true);
    assert.equal(document.getElementById('status').textContent, '无效的歌曲 ID');
  }
});

test('playback errors remain visible until playback succeeds', () => {
  const { window, document, audio } = player('id=1');
  audio.dispatchEvent(new window.Event('error'));
  audio.dispatchEvent(new window.Event('pause'));
  audio.dispatchEvent(new window.Event('waiting'));
  assert.equal(document.getElementById('status').textContent, '暂时无法播放，请在网易云打开。');
  assert.equal(document.getElementById('song-link').hidden, false);
  audio.dispatchEvent(new window.Event('playing'));
  assert.equal(document.getElementById('status').textContent, '正在播放');
});

test('API failures preserve direct playback and expose a usable fallback', async () => {
  const calls = [];
  const { document, audio } = player('id=1&api=' + encodeURIComponent('/api/netease/'), (url) => {
    calls.push(url.href);
    return Promise.reject(new Error('CORS or network failure'));
  });
  await settle();
  assert.deepEqual(calls, [
    'https://example.test/api/netease/song/detail?ids=1',
    'https://example.test/api/netease/song/url?id=1',
    'https://example.test/api/netease/lyric?id=1'
  ]);
  assert.equal(audio.src, 'https://music.163.com/song/media/outer/url?id=1.mp3');
  assert.equal(document.getElementById('status').textContent, '歌曲信息暂不可用，可尝试播放。');
});

test('optional API supplies text safely, HTTPS media, and lyrics that follow seeks', async () => {
  const maliciousTitle = '<img src=x onerror=alert(1)>';
  const { window, document, audio } = player('id=1&api=' + encodeURIComponent('https://api.example.test/v1/'), async (url) => {
    const data = url.pathname.endsWith('song/detail')
      ? { songs: [{ name: maliciousTitle, ar: [{ name: '歌手' }], al: { picUrl: 'http://cdn.example.test/cover.jpg' } }] }
      : url.pathname.endsWith('song/url')
        ? { data: [{ url: 'http://cdn.example.test/song.mp3' }] }
        : { lrc: { lyric: '[00:02.00][00:12.00]第一句\n[00:08.00]第二句' } };
    return { ok: true, json: async () => data };
  });
  await settle();
  assert.equal(document.getElementById('title').textContent, maliciousTitle);
  assert.equal(document.getElementById('title').children.length, 0);
  assert.equal(document.getElementById('artist').textContent, '歌手');
  assert.equal(document.getElementById('cover').src, 'https://cdn.example.test/cover.jpg');
  assert.equal(audio.src, 'https://cdn.example.test/song.mp3');
  Object.defineProperty(audio, 'paused', { get: () => false });
  for (const [time, expected] of [[9, '第二句'], [3, '第一句'], [13, '第一句']]) {
    audio.currentTime = time;
    audio.dispatchEvent(new window.Event('timeupdate'));
    assert.equal(document.getElementById('lyric').textContent, expected);
    assert.equal(document.getElementById('status').hidden, true);
  }
});

test('missing API media and lyrics keep the default player usable', async () => {
  const { document, audio } = player('id=1&api=' + encodeURIComponent('https://api.example.test/'), async (url) => ({
    ok: true,
    json: async () => url.pathname.endsWith('song/detail')
      ? { songs: [{ name: '歌名', artists: [{ name: '歌手' }], album: { picUrl: 'javascript:alert(1)' } }] }
      : { data: [{ url: null }] }
  }));
  await settle();
  assert.equal(document.getElementById('title').textContent, '歌名');
  assert.equal(document.getElementById('artist').textContent, '歌手');
  assert.equal(document.getElementById('cover').hidden, true);
  assert.equal(document.getElementById('lyric').hidden, true);
  assert.equal(audio.src, 'https://music.163.com/song/media/outer/url?id=1.mp3');
});

test('realIP reaches the audio API and trial audio is clearly labelled', async () => {
  const calls = [];
  const { window, document, audio } = player('id=1&api=' + encodeURIComponent('https://api.example.test/') + '&real_ip=116.25.146.177', async (url) => {
    calls.push(url.href);
    return { ok: true, json: async () => url.pathname.endsWith('song/url')
      ? { data: [{ url: 'https://cdn.example.test/trial.mp3', freeTrialInfo: { start: 0, end: 30 } }] }
      : { songs: [{ name: '歌名' }] }
    };
  });
  await settle();
  assert.ok(calls.includes('https://api.example.test/song/url?id=1&realIP=116.25.146.177'));
  assert.ok(calls.includes('https://api.example.test/song/detail?ids=1&realIP=116.25.146.177'));
  assert.ok(calls.includes('https://api.example.test/lyric?id=1&realIP=116.25.146.177'));
  assert.equal(audio.src, 'https://cdn.example.test/trial.mp3');
  assert.equal(document.getElementById('status').textContent, '当前音源提供试听，点击播放。');
  audio.dispatchEvent(new window.Event('playing'));
  assert.equal(document.getElementById('status').textContent, '正在播放试听片段');
});

test('insecure or invalid API schemes fail before making requests', async () => {
  for (const api of ['http://api.example.test/', 'javascript:alert(1)']) {
    const { document, audio } = player('id=1&api=' + encodeURIComponent(api));
    await settle();
    assert.equal(document.getElementById('status').textContent, '音乐 API 地址无效，可尝试直接播放。');
    assert.equal(audio.src, 'https://music.163.com/song/media/outer/url?id=1.mp3');
  }
});

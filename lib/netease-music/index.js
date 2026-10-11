'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { escapeHTML, url_for } = require('hexo-util');

function createExtension(hexo) {
  return {
    name: 'neteaseMusic',
    level: 'inline',
    start(source) {
      return source.indexOf('!:[wyy_music_id=');
    },
    tokenizer(source) {
      // Marked also tokenizes text inside raw HTML <code> and <pre>.
      if (this.lexer.state.inRawBlock) return;
      const match = /^!:\[wyy_music_id=([1-9]\d*)\]/.exec(source);
      if (match) return { type: 'neteaseMusic', raw: match[0], id: match[1] };
    },
    renderer(token) {
      const params = new URLSearchParams({ id: token.id });
      const config = hexo.config.netease_music || {};
      const api = config.api;
      if (api) params.set('api', String(api));
      if (api && config.real_ip) params.set('real_ip', String(config.real_ip));
      const src = url_for.call(hexo, '/music-player/index.html') + '?' + params;
      return `<iframe class="netease-music" src="${escapeHTML(src)}" title="网易云音乐播放器 ${token.id}" width="530" height="166" loading="lazy" style="display:block;width:100%;max-width:530px;height:166px;border:0"></iframe>`;
    }
  };
}

function generateAssets() {
  return ['index.html', 'player.css', 'player.js'].map((name) => ({
    path: `music-player/${name}`,
    data: fs.readFileSync(path.join(__dirname, 'assets', name), 'utf8')
  }));
}

function register(hexo) {
  hexo.extend.filter.register('marked:extensions', (extensions) => {
    extensions.push(createExtension(hexo));
  });
  hexo.extend.generator.register('netease-music-player', generateAssets);
}

module.exports = { createExtension, generateAssets, register };

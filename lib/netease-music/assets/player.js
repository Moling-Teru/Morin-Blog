'use strict';

// Self-hosted UI inspired by dontpanic92/embedded-netease-music-player.
// No remote scripts or API are required for the default external audio URL.
(() => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const audio = document.getElementById('audio');
  const title = document.getElementById('title');
  const artist = document.getElementById('artist');
  const cover = document.getElementById('cover');
  const coverWrap = document.getElementById('cover-wrap');
  const link = document.getElementById('song-link');
  const status = document.getElementById('status');
  const lyric = document.getElementById('lyric');
  const controls = document.getElementById('controls');
  const playBtn = document.getElementById('play-btn');
  const iconPlay = playBtn?.querySelector('.icon-play');
  const iconPause = playBtn?.querySelector('.icon-pause');
  const progressSlider = document.getElementById('progress-slider');
  const progressFill = document.getElementById('progress-fill');
  const progressThumb = document.getElementById('progress-thumb');
  const currentTimeEl = document.getElementById('current-time');
  const durationTimeEl = document.getElementById('duration-time');
  const volumeBtn = document.getElementById('volume-btn');
  const iconVolume = volumeBtn?.querySelector('.icon-volume');
  const iconMuted = volumeBtn?.querySelector('.icon-muted');

  let lyrics = [];
  let playbackFailed = false;
  let isTrial = false;
  let isDragging = false;
  let lastVolume = 1;

  if (!/^[1-9]\d*$/.test(id || '')) {
    status.textContent = '无效的歌曲 ID';
    status.hidden = false;
    audio.hidden = true;
    if (controls) controls.hidden = true;
    return;
  }

  title.textContent = `网易云音乐 · ${id}`;
  const isMobile = navigator.userAgentData?.mobile
    ?? /Android.*Mobile|iPhone|iPod|Windows Phone|IEMobile|Opera Mini/i.test(navigator.userAgent);
  link.href = isMobile ? `orpheus://song/${id}` : `https://music.163.com/#/song?id=${id}`;
  link.hidden = false;
  audio.src = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
    if (message) lyric.hidden = true;
  }

  function updatePlayButton() {
    const isPaused = audio.paused;
    if (iconPlay) iconPlay.hidden = !isPaused;
    if (iconPause) iconPause.hidden = isPaused;
    if (playBtn) playBtn.setAttribute('aria-label', isPaused ? '播放' : '暂停');
  }

  function togglePlay() {
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  playBtn?.addEventListener('click', togglePlay);
  coverWrap?.addEventListener('click', togglePlay);

  function updateProgress() {
    const current = audio.currentTime || 0;
    const duration = audio.duration;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(current);
    if (durationTimeEl && Number.isFinite(duration) && duration > 0) {
      durationTimeEl.textContent = formatTime(duration);
    }
    const percent = Number.isFinite(duration) && duration > 0 ? Math.min((current / duration) * 100, 100) : 0;
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressThumb) progressThumb.style.left = `${percent}%`;
    if (progressSlider) progressSlider.setAttribute('aria-valuenow', String(Math.round(percent)));
  }

  function seekTo(event) {
    const duration = audio.duration;
    if (!duration || !Number.isFinite(duration) || !progressSlider) return;
    const rect = progressSlider.getBoundingClientRect();
    if (!rect.width) return;
    const clientX = event.clientX ?? (event.touches && event.touches[0]?.clientX) ?? 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    updateProgress();
  }

  progressSlider?.addEventListener('pointerdown', (e) => {
    isDragging = true;
    progressSlider.setPointerCapture?.(e.pointerId);
    seekTo(e);
  });
  progressSlider?.addEventListener('pointermove', (e) => {
    if (isDragging) seekTo(e);
  });
  progressSlider?.addEventListener('pointerup', (e) => {
    if (isDragging) {
      isDragging = false;
      progressSlider.releasePointerCapture?.(e.pointerId);
    }
  });
  progressSlider?.addEventListener('pointercancel', () => {
    isDragging = false;
  });
  progressSlider?.addEventListener('keydown', (e) => {
    const duration = audio.duration;
    if (!duration || !Number.isFinite(duration)) return;
    const step = 5;
    if (e.key === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - step);
      updateProgress();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      audio.currentTime = Math.min(duration, audio.currentTime + step);
      updateProgress();
      e.preventDefault();
    }
  });

  function updateVolumeUI() {
    const isMuted = audio.muted || audio.volume === 0;
    if (iconVolume) iconVolume.hidden = isMuted;
    if (iconMuted) iconMuted.hidden = !isMuted;
    if (volumeBtn) volumeBtn.setAttribute('aria-label', isMuted ? '取消静音' : '静音');
  }

  volumeBtn?.addEventListener('click', () => {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      audio.volume = lastVolume > 0 ? lastVolume : 1;
    } else {
      lastVolume = audio.volume;
      audio.muted = true;
    }
    updateVolumeUI();
  });
  audio.addEventListener('volumechange', updateVolumeUI);

  audio.addEventListener('error', () => {
    playbackFailed = true;
    updatePlayButton();
    showStatus('暂时无法播放，请在网易云打开。');
  });
  audio.addEventListener('play', updatePlayButton);
  audio.addEventListener('playing', () => {
    playbackFailed = false;
    updatePlayButton();
    showStatus(isTrial ? '正在播放试听片段' : '正在播放');
    updateLyric();
  });
  audio.addEventListener('pause', () => {
    updatePlayButton();
    if (!playbackFailed) showStatus('已暂停');
  });
  audio.addEventListener('waiting', () => {
    if (!playbackFailed) showStatus('正在缓冲…');
  });
  audio.addEventListener('timeupdate', () => {
    updateProgress();
    updateLyric();
  });
  audio.addEventListener('durationchange', updateProgress);
  audio.addEventListener('loadedmetadata', updateProgress);
  audio.addEventListener('seeked', () => {
    updateProgress();
    updateLyric();
  });

  function updateLyric() {
    if (audio.paused || playbackFailed || !lyrics.length) return;
    let text = '';
    for (const line of lyrics) {
      if (line.time > audio.currentTime) break;
      text = line.text;
    }
    lyric.textContent = text;
    lyric.hidden = !text;
    status.hidden = Boolean(text);
  }

  function parseLyrics(text) {
    const lines = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const words = line.replace(/\[[^\]]*\]/g, '').trim();
      for (const match of line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) {
        lines.push({ time: Number(match[1]) * 60 + Number(match[2]), text: words });
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  function mediaUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      // HTTPS pages must not load insecure audio or album art.
      if (url.protocol === 'http:') url.protocol = 'https:';
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function applyCoverTheme(imageUrl) {
    // Sample separately: a CDN without CORS must not prevent the cover from displaying.
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('load', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        const buckets = new Map();
        for (let i = 0; i < pixels.length; i += 4) {
          const [r, g, b, alpha] = pixels.subarray(i, i + 4);
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          // Ignore transparent pixels, near-black shadows and near-white backgrounds.
          if (alpha < 128 || max < 24 || min > 232) continue;
          const key = `${r >> 5},${g >> 5},${b >> 5}`;
          const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
          bucket.count++;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
          buckets.set(key, bucket);
        }
        const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
        if (!dominant) return;
        const r = dominant.r / dominant.count / 255;
        const g = dominant.g / dominant.count / 255;
        const b = dominant.b / dominant.count / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        const lightness = (max + min) / 2;
        let hue = 0;
        let saturation = 0;
        if (delta > 0) {
          saturation = delta / (1 - Math.abs(2 * lightness - 1));
          hue = max === r ? ((g - b) / delta + 6) % 6
            : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        }
        // Keep the cover's hue, with restrained tints and a readable title color in CSS.
        const style = document.documentElement.style;
        style.setProperty('--player-hue', String(Math.round(hue * 60)));
        style.setProperty('--player-saturation', `${Math.round(Math.min(saturation, 0.7) * 100)}%`);
      } catch {
        // Canvas restrictions or unsupported sampling leave the default blue-purple theme.
      }
    }, { once: true });
    image.src = imageUrl;
  }

  async function getApi(api, endpoint, query) {
    const url = new URL(endpoint, api);
    url.search = new URLSearchParams(query).toString();
    // The same-site Function can need extra time for its first cold start.
    const timeoutMs = api.origin === window.location.origin ? 25000 : 8000;
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadMetadata() {
    const base = params.get('api');
    if (!base) return;
    let api;
    try {
      api = new URL(base.replace(/\/+$/, '') + '/', window.location.href);
      if (!['https:', 'http:'].includes(api.protocol)) throw new Error('Invalid API URL');
      if (window.location.protocol === 'https:' && api.protocol !== 'https:') {
        throw new Error('The API must use HTTPS');
      }
    } catch {
      showStatus('音乐 API 地址无效，可尝试直接播放。');
      return;
    }

    // Details and lyrics can fail independently without preventing playback.
    const requestOptions = params.get('real_ip') ? { realIP: params.get('real_ip') } : {};
    const results = await Promise.allSettled([
      getApi(api, 'song/detail', { ids: id, ...requestOptions }).then((data) => {
        const song = data.songs && data.songs[0];
        if (!song) throw new Error('Song not found');
        title.textContent = song.name || title.textContent;
        artist.textContent = (song.ar || song.artists || []).map((item) => item.name).join(' / ') || '网易云音乐';
        if (song.dt && typeof song.dt === 'number' && durationTimeEl && (!audio.duration || Number.isNaN(audio.duration))) {
          durationTimeEl.textContent = formatTime(song.dt / 1000);
        }
        const imageUrl = mediaUrl((song.al || song.album || {}).picUrl);
        if (imageUrl) {
          cover.addEventListener('error', () => { cover.hidden = true; }, { once: true });
          cover.addEventListener('load', () => applyCoverTheme(imageUrl), { once: true });
          cover.src = imageUrl;
          cover.hidden = false;
        }
      }),
      getApi(api, 'song/url', {
        id,
        ...requestOptions
      }).then((data) => {
        const song = data.data && data.data[0];
        const url = song && mediaUrl(song.url);
        // Do not interrupt audio if the visitor has already started playing.
        if (url && audio.paused && !audio.currentTime) {
          audio.src = url;
          playbackFailed = false;
          isTrial = Boolean(song.freeTrialInfo);
          if (isTrial) {
            showStatus('当前音源提供试听，点击播放。');
          } else {
            status.textContent = '';
            status.hidden = true;
          }
        }
      }),
      getApi(api, 'lyric', { id, ...requestOptions }).then((data) => {
        lyrics = parseLyrics(data.lrc && data.lrc.lyric);
        updateLyric();
      })
    ]);
    if (results[0].status === 'rejected' && !playbackFailed && audio.paused) {
      showStatus('歌曲信息暂不可用，可尝试播放。');
    }
  }

  loadMetadata().catch(() => {
    if (!playbackFailed) showStatus('歌曲信息暂不可用，可尝试播放。');
  });
})();

import { getApiUrl } from './api.js';

let activePlayback = null;

function stopActivePlayback(notify = true) {
  const active = activePlayback;
  if (!active) return;
  activePlayback = null;
  active.audio.pause();
  active.audio.removeAttribute('src');
  active.audio.load();
  for (const [event, handler] of Object.entries(active.handlers)) {
    active.audio.removeEventListener(event, handler);
  }
  if (notify) active.onState('stopped');
}

export function playGameAudio(url, onState = () => {}, { muted = false, volume = 1 } = {}) {
  const sourceUrl = getApiUrl(url);
  stopActivePlayback();
  const audio = new Audio();
  audio.crossOrigin = 'use-credentials';
  audio.preload = 'auto';
  audio.muted = muted;
  audio.volume = Math.max(0, Math.min(1, volume));
  const handlers = {};
  const playback = { audio, handlers, onState };
  const finish = (state) => {
    if (activePlayback !== playback) return;
    activePlayback = null;
    for (const [event, handler] of Object.entries(handlers)) {
      audio.removeEventListener(event, handler);
    }
    onState(state);
  };
  handlers.playing = () => onState('playing');
  handlers.ended = () => finish('ended');
  handlers.error = () => finish('error');
  for (const [event, handler] of Object.entries(handlers)) {
    audio.addEventListener(event, handler);
  }
  activePlayback = playback;
  audio.src = sourceUrl;
  onState('loading');
  void audio.play().catch(() => finish('error'));

  return (notify = true) => {
    if (activePlayback === playback) stopActivePlayback(notify);
  };
}

export function stopGameAudio() {
  stopActivePlayback();
}

window.serverOffset = 0;
console.log("loaded js");

const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();
const recordingDest = audioCtx.createMediaStreamDestination();
window.recordingDest = recordingDest;
window.recordingIncludesLTC = true;

// Chunk cache: key = "H_M", value = { buffer, promise }
const chunkCache = new Map();

let isPlaying = false;
let playbackSource = null;
let playbackStartAudioTime = 0;
let playbackStartOffset = 0;
let playingChunkId = [-1, -1];

// ── Chunk helpers ──────────────────────────────────────────────────────────────

function chunkKey(hour_min_id) {
  return `${hour_min_id[0]}_${hour_min_id[1]}`;
}

window.is_playing_LTC = () => {
  return isPlaying;
};

function nextChunkId(id) {
  const nextMin = (id[1] + 1) % 6;
  const nextHour = nextMin === 0 ? id[0] + 1 : id[0];
  return [nextHour, nextMin];
}

function currentChunkId() {
  const serverMs = Date.now() + serverOffset;
  const totalSeconds = Math.floor(serverMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60) % 12;
  const minutes = totalMinutes % 60;
  return [hours, Math.floor(minutes / 10)];
}

function getCurrentOffsetInChunk() {
  const serverMs = Date.now() + serverOffset;
  const totalSeconds = Math.floor(serverMs / 1000);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  const ms = serverMs % 1000;
  const chunkStartMinutes = currentChunkId()[1] * 10;
  return (minutes - chunkStartMinutes) * 60 + seconds + ms / 1000;
}

window.get_url_from_hour_min_id = (id) => {
  return `file/LTC_${String(id[0]).padStart(2, "0")}_${String(id[1] * 10).padStart(2, "0")}_00_00__10mins_2997_df.wav`;
};

// ── Buffer loading ─────────────────────────────────────────────────────────────

// Returns a promise that resolves to an AudioBuffer.
// De-duplicates in-flight requests and caches results.
function loadChunk(id) {
  const key = chunkKey(id);
  if (chunkCache.has(key)) return chunkCache.get(key).promise;

  const entry = { buffer: null, promise: null };
  entry.promise = (async () => {
    try {
      const url = get_url_from_hour_min_id(id);
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      entry.buffer = await audioCtx.decodeAudioData(arrayBuffer);
      console.log(`Chunk loaded: ${key}`);
      return entry.buffer;
    } catch (err) {
      console.error(`Failed to load chunk ${key}:`, err);
      chunkCache.delete(key); // allow retry
      return null;
    }
  })();
  chunkCache.set(key, entry);
  return entry.promise;
}

// Evict chunks we no longer need (keep current + next only)
function evictOldChunks() {
  const current = chunkKey(currentChunkId());
  const next = chunkKey(nextChunkId(currentChunkId()));
  for (const key of chunkCache.keys()) {
    if (key !== current && key !== next) {
      console.log(`Evicting chunk: ${key}`);
      chunkCache.delete(key);
    }
  }
}

// Pre-warm: load current chunk and next chunk ahead of time
function preloadChunks() {
  const current = currentChunkId();
  const next = nextChunkId(current);
  loadChunk(current);
  loadChunk(next);
  evictOldChunks();
}

// ── Seamless scheduled playback ────────────────────────────────────────────────

// Schedule two BufferSourceNodes back-to-back: current chunk (from offset)
// and next chunk (from the beginning), using audioCtx.currentTime for
// sample-accurate gapless handoff.
async function schedulePlayback(chunkId, offsetInChunk) {
  if (!isPlaying) return;

  // Stop whatever is running
  if (playbackSource) {
    playbackSource.onended = null;
    try {
      playbackSource.stop();
    } catch (_) {}
    playbackSource = null;
  }

  const buffer = await loadChunk(chunkId);
  if (!buffer || !isPlaying) return;

  const remaining = buffer.duration - offsetInChunk;
  if (remaining <= 0) {
    // Already past end — jump to next chunk
    schedulePlayback(nextChunkId(chunkId), 0);
    return;
  }

  // ── Primary source (current chunk) ──
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(audioCtx.destination);
  if (window.recordingIncludesLTC) src.connect(window.recordingDest);

  const primaryStartAudio = audioCtx.currentTime;
  src.start(primaryStartAudio, offsetInChunk);

  playbackSource = src;
  playbackStartAudioTime = primaryStartAudio;
  playbackStartOffset = offsetInChunk;
  playingChunkId = chunkId;

  // ── Pre-load next chunk and schedule it sample-accurately ──
  const nextId = nextChunkId(chunkId);
  const primaryEndAudio = primaryStartAudio + remaining;

  loadChunk(nextId).then((nextBuffer) => {
    if (!isPlaying || !nextBuffer) return;

    // Only schedule the follow-on if the primary source is still the one we set
    const followSrc = audioCtx.createBufferSource();
    followSrc.buffer = nextBuffer;
    followSrc.connect(audioCtx.destination);
    if (window.recordingIncludesLTC) followSrc.connect(window.recordingDest);
    followSrc.start(primaryEndAudio, 0); // starts exactly when primary ends

    // When *this* source ends, schedule the one after it
    followSrc.onended = () => {
      if (!isPlaying) return;
      const afterNext = nextChunkId(nextId);
      schedulePlayback(afterNext, 0);
    };

    // If the primary ends while we're still loading, onended recovers
    src.onended = () => {
      // followSrc is already scheduled — nothing to do
    };
  });

  // Fallback: if next chunk failed/wasn't ready, primary's onended reschedules
  src.onended = () => {
    if (!isPlaying) return;
    schedulePlayback(nextId, 0);
  };
}

// ── Public controls ────────────────────────────────────────────────────────────

function pause_play_LTC_timecodes() {
  if (audioCtx.state === "suspended") audioCtx.resume();

  if (isPlaying) {
    if (playbackSource) {
      playbackSource.onended = null;
      try {
        playbackSource.stop();
      } catch (_) {}
      playbackSource = null;
    }
    isPlaying = false;
  } else {
    isPlaying = true;
    schedulePlayback(currentChunkId(), getCurrentOffsetInChunk());
  }
}
window.pause_play_LTC_timecodes = pause_play_LTC_timecodes;

// ── Drift correction ───────────────────────────────────────────────────────────

function syncAudioToClockIfNeeded() {
  if (!isPlaying || !playbackSource) return;

  // Only correct if we're in the expected chunk
  const expectedChunk = currentChunkId();
  if (chunkKey(playingChunkId) !== chunkKey(expectedChunk)) return;

  const expectedOffset = getCurrentOffsetInChunk();
  const actualOffset =
    playbackStartOffset + (audioCtx.currentTime - playbackStartAudioTime);
  const drift = Math.abs(expectedOffset - actualOffset);

  if (drift > 0.05) {
    console.warn(`LTC drift: ${(drift * 1000).toFixed(1)}ms — resyncing`);
    schedulePlayback(expectedChunk, expectedOffset);
  }
}

// ── Time sync ──────────────────────────────────────────────────────────────────

async function syncTime() {
  try {
    const t0 = Date.now();
    const response = await fetch("/sync");
    const { t1, t2 } = await response.json();
    const t3 = Date.now();
    serverOffset = (t1 - t0 + (t2 - t3)) / 2;
    console.log(`Synced. Offset: ${serverOffset.toFixed(2)}ms`);
  } catch (e) {
    console.error("Sync failed", e);
  }
}
window.syncTime = syncTime;

// ── Display loop ───────────────────────────────────────────────────────────────

let lastPreloadMinute = -1;

function updateDisplay() {
  syncAudioToClockIfNeeded();

  // Preload only when the minute changes (not 60× per second)
  const serverMs = Date.now() + serverOffset;
  const currentMinute = Math.floor(serverMs / 60000) % 60;
  if (currentMinute !== lastPreloadMinute) {
    lastPreloadMinute = currentMinute;
    preloadChunks();
  }

  const clockElement = document.getElementById("clock");
  const infoElem = document.getElementById("info");

  const totalSeconds = Math.floor(serverMs / 1000);
  const millis = serverMs % 1000;
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  clockElement.innerHTML = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(Math.floor(millis)).padStart(3, "0")}`;
  const currentKey = chunkKey(currentChunkId());
  const nextKey = chunkKey(nextChunkId(currentChunkId()));
  const isLoading = [...chunkCache.entries()]
    .filter(([k]) => k === currentKey || k === nextKey)
    .some(([, v]) => !v.buffer);

  infoElem.innerHTML = isLoading ? "<br>loading audio…" : "";

  requestAnimationFrame(updateDisplay);
}

// ── Init ───────────────────────────────────────────────────────────────────────

syncTime().then(() => {
  preloadChunks(); // start loading immediately after first sync
});
updateDisplay();
setInterval(syncTime, 30000);

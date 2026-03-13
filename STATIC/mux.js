// ── BWF Mux: encode mic audio as a Broadcast Wave Format file ─────────────────
//
// Embeds a bext chunk with 29.97 DF SMPTE timecode derived from startTime.
// Production metadata is read from window globals and written into the bext
// Description, Originator, OriginatorReference fields and the file name.
//
// Depends on (via window):
//   audioCtx              — from ltc.js
//   getRecordingById      — from recorder.js
//   updateRecordingInDB   — from recorder.js
//   current_project       — e.g. "MyFilm"
//   current_day           — e.g. "D01"
//   current_scene         — e.g. "SC42"
//   current_take          — e.g. "T3"
//   current_operator      — e.g. "JSmith"

// ── 29.97 DF timecode ──────────────────────────────────────────────────────────
//
// Drop-frame skips frame numbers 0 and 1 at the start of every minute,
// except every 10th minute. This keeps timecode aligned with wall clock.

function msToDFTimecode(ms) {
  const frameRate = 30;
  const dropFrames = 2;

  // Total frames elapsed (using 29.97 actual rate)
  const totalFrames = Math.round((ms / 1000) * (30000 / 1001));

  // Drop-frame calculation (SMPTE standard)
  const framesPerMin = 60 * frameRate - dropFrames; // 1798
  const framesPer10Min = 10 * 60 * frameRate - dropFrames; // 17982
  const framesPerHour = 6 * framesPer10Min; // 107892

  const d = Math.floor(totalFrames / framesPer10Min);
  const mod = totalFrames % framesPer10Min;
  const extra =
    mod < dropFrames
      ? 0
      : dropFrames * Math.floor((mod - dropFrames) / framesPerMin);

  const adjusted = totalFrames + dropFrames * 9 * d + extra;

  const frames = adjusted % frameRate;
  const seconds = Math.floor(adjusted / frameRate) % 60;
  const minutes = Math.floor(adjusted / (frameRate * 60)) % 60;
  const hours = Math.floor(adjusted / (frameRate * 3600)) % 24;

  // DF timecode uses semicolons by convention
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
    String(frames).padStart(2, "0"),
  ].join(";");
}

// ── BWF / WAV encoder ──────────────────────────────────────────────────────────

// ── Production metadata helpers ────────────────────────────────────────────────

function getProductionMeta() {
  return {
    project: String(window.current_project ?? ""),
    day: String(window.current_day ?? ""),
    scene: String(window.current_scene ?? ""),
    take: String(window.current_take ?? ""),
    operator: String(window.current_operator ?? ""),
  };
}

// Builds a filename-safe slug from production metadata and timecode.
// Example: MyFilm_D01_SC42_T3_TC00;01;23;12_bwf.wav
function buildWavName(meta, tc) {
  const parts = [meta.project, meta.day, meta.scene, meta.take]
    .filter(Boolean)
    .map((p) => p.replace(/[^A-Za-z0-9_-]/g, "_"));
  parts.push(`TC${tc.replace(/;/g, "-")}`); // e.g. TC00-01-23-12
  return parts.join("_") + "_bwf.wav";
}

// ── BWF / WAV encoder ──────────────────────────────────────────────────────────

function encodeBWF(pcm, sampleRate, startTimeMs, meta) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const numSamples = pcm.length;
  const dataSize = numSamples * bytesPerSample;

  // ── bext chunk ──
  // 603 bytes: 602 fixed fields + 1 null byte for CodingHistory terminator.
  // RIFF requires chunks to start on even byte boundaries, so odd-sized chunk
  // data must be followed by a silent pad byte (not counted in the size field).
  const BEXT_SIZE = 603;
  const BEXT_PADDED = BEXT_SIZE + (BEXT_SIZE % 2); // 604 — includes pad byte
  const bextBuf = new ArrayBuffer(BEXT_PADDED); // extra byte already zeroed
  const bextView = new DataView(bextBuf);
  const bextBytes = new Uint8Array(bextBuf);

  function writeASCII(buf, offset, str, maxLen) {
    for (let i = 0; i < maxLen; i++) {
      buf[offset + i] = i < str.length ? str.charCodeAt(i) : 0;
    }
  }

  // ── Timecode string in description (256 bytes) ──
  // FIX: removed the dead first write; write timecode directly
  const d = new Date(startTimeMs);
  const midnight = new Date(d);
  midnight.setHours(0, 0, 0, 0);
  const msSinceMidnight = startTimeMs - midnight.getTime();

  const tc = msToDFTimecode(msSinceMidnight);

  // Description (256 bytes) — human-readable production info + timecode
  const desc = [
    meta.project && `Project=${meta.project}`,
    meta.day && `Day=${meta.day}`,
    meta.scene && `Scene=${meta.scene}`,
    meta.take && `Take=${meta.take}`,
    meta.operator && `Op=${meta.operator}`,
    `TC=${tc} 29.97DF`,
  ]
    .filter(Boolean)
    .join(" ");
  writeASCII(bextBytes, 0, desc, 256);

  // Originator (32 bytes) — operator name, falls back to "BrowserRecorder"
  writeASCII(bextBytes, 256, meta.operator || "BrowserRecorder", 32);

  // OriginatorReference (32 bytes) — project_day_scene_take slug
  const ref =
    [meta.project, meta.day, meta.scene, meta.take]
      .filter(Boolean)
      .join("_")
      .slice(0, 32) || "BROWSER001";
  writeASCII(bextBytes, 288, ref, 32);

  // OriginationDate (10 bytes) YYYY-MM-DD
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  writeASCII(bextBytes, 320, dateStr, 10);

  // OriginationTime (8 bytes) HH:MM:SS
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  writeASCII(bextBytes, 330, timeStr, 8);

  // TimeReference (8 bytes, uint64 little-endian) — sample offset from midnight
  const sampleOffset = Math.round((msSinceMidnight / 1000) * sampleRate);
  // Write as two 32-bit words (low, high) since JS can't do uint64
  bextView.setUint32(338, sampleOffset >>> 0, true);
  bextView.setUint32(342, 0, true); // high word — won't overflow for 24h at 48kHz

  // Version (2 bytes)
  bextView.setUint16(346, 1, true);

  // UMID (64 bytes) — zeroed, not required
  // Reserved (190 bytes) — zeroed
  // CodingHistory — empty, null terminated (byte 602 already zero from ArrayBuffer)

  // ── Assemble full file ──
  // RIFF > fmt > bext > data
  const fmtSize = 16;
  const totalSize =
    4 + // "WAVE"
    8 +
    fmtSize + // fmt chunk
    8 +
    BEXT_PADDED + // bext chunk (padded to even boundary)
    8 +
    dataSize; // data chunk

  const buf = new ArrayBuffer(8 + totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  }

  let o = 0;
  writeStr(o, "RIFF");
  o += 4;
  view.setUint32(o, totalSize, true);
  o += 4;
  writeStr(o, "WAVE");
  o += 4;

  // fmt chunk
  writeStr(o, "fmt ");
  o += 4;
  view.setUint32(o, fmtSize, true);
  o += 4;
  view.setUint16(o, 1, true);
  o += 2; // PCM
  view.setUint16(o, numChannels, true);
  o += 2;
  view.setUint32(o, sampleRate, true);
  o += 4;
  view.setUint32(o, sampleRate * numChannels * bytesPerSample, true);
  o += 4;
  view.setUint16(o, numChannels * bytesPerSample, true);
  o += 2;
  view.setUint16(o, 16, true);
  o += 2; // bits per sample

  // bext chunk
  writeStr(o, "bext");
  o += 4;
  view.setUint32(o, BEXT_SIZE, true);
  o += 4;
  bytes.set(new Uint8Array(bextBuf), o);
  o += BEXT_PADDED;

  // data chunk
  writeStr(o, "data");
  o += 4;
  view.setUint32(o, dataSize, true);
  o += 4;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }

  return { buf, msSinceMidnight };
}

// ── Main mux function ──────────────────────────────────────────────────────────

async function muxRecording(id) {
  const record = await window.getRecordingById(id);
  if (!record) return console.error("muxRecording: record not found", id);

  const meta = getProductionMeta();

  // FIX: wrap decode + encode in try/catch to surface errors clearly
  let wavBuffer, msSinceMidnight;
  try {
    const arrayBuffer = await record.blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const pcm = audioBuffer.getChannelData(0);
    const sampleRate = audioCtx.sampleRate;
    const startTimeMs = record.startTime;

    ({ buf: wavBuffer, msSinceMidnight } = encodeBWF(
      pcm,
      sampleRate,
      startTimeMs,
      meta,
    ));
  } catch (err) {
    return console.error(
      "muxRecording: failed to decode or encode audio",
      id,
      err,
    );
  }
  const tc = msToDFTimecode(msSinceMidnight);
  const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
  const wavName = buildWavName(meta, tc);

  await window.updateRecordingInDB({
    ...record,
    blob: wavBlob,
    name: wavName,
    muxed: true,
  });

  // FIX: log timecode using msSinceMidnight (consistent with bext chunk)
  console.log(
    `BWF mux complete: id=${id} project=${meta.project} day=${meta.day} ` +
      `scene=${meta.scene} take=${meta.take} op=${meta.operator} ` +
      `tc=${tc} saved as ${wavName}`,
  );
}

window.muxRecording = muxRecording;

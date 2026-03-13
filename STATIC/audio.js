// ── IndexedDB setup ────────────────────────────────────────────────────────────

const DB_NAME = "recordings";
const DB_STORE = "files";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(DB_STORE, {
        keyPath: "id",
        autoIncrement: true,
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveRecordingToDB(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function updateRecordingInDB(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getAllRecordings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getRecordingById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteRecordingById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getRecordingURL(id) {
  const record = await getRecordingById(id);
  if (!record) return null;
  return URL.createObjectURL(record.blob);
}

async function downloadRecording(id) {
  const record = await getRecordingById(id);
  if (!record) return console.error("Recording not found:", id);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(record.blob);
  a.download = record.name;
  a.click();
}

// ── Recorder ───────────────────────────────────────────────────────────────────

let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;

async function startRecording() {
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  recordedChunks = [];
  recordingStartTime = Date.now() + (window.serverOffset || 0);

  mediaRecorder = new MediaRecorder(micStream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    const id = await saveRecordingToDB({
      blob,
      name: `recording_${new Date(recordingStartTime).toISOString()}.webm`,
      date: recordingStartTime,
      startTime: recordingStartTime,
      muxed: false,
    });
    console.log(`Webm saved with id: ${id}, starting mux...`);
    await window.muxRecording(id);
  };
  mediaRecorder.start();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  window.last_change = Date.now() + serverOffset;
}

window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.getAllRecordings = getAllRecordings;
window.getRecordingById = getRecordingById;
window.getRecordingURL = getRecordingURL;
window.downloadRecording = downloadRecording;
window.deleteRecordingById = deleteRecordingById;
window.updateRecordingInDB = updateRecordingInDB;
window.openDB = openDB;

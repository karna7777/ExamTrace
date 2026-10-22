// ExamTrace - Storage Service
//
// All JSON file persistence lives here and is owned by the Main process.
// Key safety properties the spec requires:
//   * Reads never destroy data: a missing file returns a fallback, but a file
//     that exists and is corrupt THROWS (so callers don't overwrite it with []).
//   * Writes are atomic: we write to a temporary file then rename it over the
//     target, so a crash mid-write cannot leave a half-written JSON file.
//   * Writes to the same file are queued, so two writes can't interleave and an
//     older write can't land after a newer one.

const { app } = require("electron");
const fsp = require("fs/promises");
const path = require("path");

function dataDir() {
  // app.getPath is only valid after the app is ready; these functions are
  // always called from IPC handlers, which run after startup.
  return app.getPath("userData");
}

function filePath(name) {
  return path.join(dataDir(), name);
}

// One promise "chain" per file name guarantees writes run one at a time.
const writeChains = new Map();

async function fileExists(name) {
  try {
    await fsp.access(filePath(name));
    return true;
  } catch {
    return false;
  }
}

// Read and parse a JSON file.
// - File missing (ENOENT): return the provided fallback (a normal first run).
// - File exists but unreadable or not valid JSON: throw, so the caller treats
//   it as a recoverable error instead of silently replacing good data.
async function readJson(name, fallback) {
  let raw;
  try {
    raw = await fsp.readFile(filePath(name), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err; // e.g. permission error - do not treat as empty
  }
  try {
    return JSON.parse(raw);
  } catch {
    const e = new Error('Data file "' + name + '" is corrupted and could not be parsed.');
    e.code = "CORRUPT_DATA";
    throw e;
  }
}

// Queued, atomic write. Returns a promise that resolves when THIS write lands.
function writeJson(name, data) {
  const runWrite = async () => {
    const target = filePath(name);
    const tmp = target + ".tmp-" + process.pid + "-" + Date.now();
    const json = JSON.stringify(data, null, 2);
    await fsp.writeFile(tmp, json, "utf8");
    await fsp.rename(tmp, target); // atomic replace on the same filesystem
    return true;
  };

  // Continue the chain whether or not the previous write succeeded, so one
  // failure doesn't block all later writes to the file.
  const previous = writeChains.get(name) || Promise.resolve();
  const next = previous.then(runWrite, runWrite);

  // Store a swallowed version so the chain never rejects internally; the
  // caller still sees the real result/errors through `next`.
  writeChains.set(
    name,
    next.catch(() => {})
  );
  return next;
}

module.exports = { filePath, fileExists, readJson, writeJson };

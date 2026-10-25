// ExamTrace - Settings Service
//
// Reads/writes settings.json and enforces which settings each mode may change.
// Candidates may only change display preferences (e.g. theme). Examiner-only
// settings (default duration, monitoring thresholds, demo mode) can only be
// changed while Examiner Mode is unlocked. This file also stores the one-time
// marker that records whether the built-in sample exam has been seeded.

const storage = require("./storageService.cjs");

const SETTINGS_FILE = "settings.json";

const DEFAULTS = {
  theme: "system", // "light" | "dark" | "system"
  defaultDurationMinutes: 30,
  fullscreenDuringExam: false,
  inactivityThresholdSeconds: 60,
  demoMode: false,
  cameraMonitoring: false,
  groqApiKey: "", // examiner-only; never returned to the renderer (see settings:get)
  sampleExamSeeded: false,
  serverUrl: "" // optional teacher server; a student may set this too
};

// Settings a candidate (not unlocked as examiner) is allowed to change.
// serverUrl is allowed because students connect to a teacher server too.
const CANDIDATE_ALLOWED_KEYS = ["theme", "serverUrl"];

async function getSettings() {
  const saved = await storage.readJson(SETTINGS_FILE, {});
  return { ...DEFAULTS, ...(saved && typeof saved === "object" ? saved : {}) };
}

async function writeAll(settings) {
  await storage.writeJson(SETTINGS_FILE, settings);
  return settings;
}

// Apply a patch, but reject examiner-only keys when not unlocked.
async function updateSettings(patch, isExaminer) {
  if (!patch || typeof patch !== "object") {
    throw new Error("Invalid settings data.");
  }
  if (!isExaminer) {
    for (const key of Object.keys(patch)) {
      if (!CANDIDATE_ALLOWED_KEYS.includes(key)) {
        throw new Error("Examiner access required to change: " + key);
      }
    }
  }
  const current = await getSettings();
  const merged = { ...current, ...patch };
  return writeAll(merged);
}

// Record that the sample exam has been created so it is never recreated.
async function markSampleSeeded() {
  const current = await getSettings();
  await writeAll({ ...current, sampleExamSeeded: true });
}

module.exports = { getSettings, updateSettings, markSampleSeeded, DEFAULTS };

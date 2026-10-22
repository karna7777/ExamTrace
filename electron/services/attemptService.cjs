// ExamTrace - Attempt Persistence Service
//
// Persists examination attempts using the single storageService writer (no
// second JSON writer):
//   * attempts.json      - finalized attempts (history + reports)
//   * active-attempt.json - the in-progress checkpoint for restart recovery
//
// Reports are built from the stored exam SNAPSHOT saved on the attempt, so
// editing or deleting the original exam later never changes old reports.

const storage = require("./storageService.cjs");

const ATTEMPTS_FILE = "attempts.json";
const ACTIVE_FILE = "active-attempt.json";

async function readAttempts() {
  const list = await storage.readJson(ATTEMPTS_FILE, []);
  return Array.isArray(list) ? list : [];
}

async function hasAttempt(id) {
  const attempts = await readAttempts();
  return attempts.some((a) => a.id === id);
}

// Append a finalized attempt. Idempotent: if an attempt with the same id is
// already stored (e.g. a crash happened between writing history and clearing the
// checkpoint), we do not create a duplicate.
async function saveFinalizedAttempt(attempt) {
  const attempts = await readAttempts();
  if (attempts.some((a) => a.id === attempt.id)) {
    return { ok: true, duplicate: true };
  }
  attempts.push(attempt);
  await storage.writeJson(ATTEMPTS_FILE, attempts);
  return { ok: true };
}

// Checkpoint the in-progress attempt (full state incl. snapshot, answers,
// review flags, events and the absolute deadline).
function saveCheckpoint(attempt) {
  return storage.writeJson(ACTIVE_FILE, attempt);
}

async function readCheckpoint() {
  return storage.readJson(ACTIVE_FILE, null);
}

function clearCheckpoint() {
  return storage.deleteJson(ACTIVE_FILE);
}

// History list: compact summaries, newest first.
async function getHistory() {
  const attempts = await readAttempts();
  return attempts
    .map((a) => {
      const r = a.result || {};
      return {
        attemptId: a.id,
        examId: a.examId,
        title: r.title || (a.examSnapshot ? a.examSnapshot.title : "Examination"),
        candidateName: a.candidateName,
        endedAt: a.endedAt,
        score: r.score || 0,
        totalQuestions: r.totalQuestions || 0,
        percentage: r.percentage || 0,
        submissionType: r.submissionType || (a.status === "auto_submitted" ? "auto" : "manual"),
        timeUsedMs: r.timeUsedMs || 0,
        monitoringEvents: Array.isArray(a.events) ? a.events.length : 0
      };
    })
    .sort((x, y) => new Date(y.endedAt).getTime() - new Date(x.endedAt).getTime());
}

// Full report for one attempt (the stored result: totals, review, timeline,
// monitoring summary).
async function getReport(attemptId) {
  const attempts = await readAttempts();
  const a = attempts.find((x) => x.id === attemptId);
  if (!a) throw new Error("Attempt not found.");
  return a.result;
}

module.exports = {
  readAttempts,
  hasAttempt,
  saveFinalizedAttempt,
  saveCheckpoint,
  readCheckpoint,
  clearCheckpoint,
  getHistory,
  getReport
};

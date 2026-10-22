// ExamTrace - Exam Session Service (the examination engine)
//
// The Main process owns the ONE active attempt and is the authoritative source
// for the timer and the score. The renderer only displays what Main sends.
//
// Key guarantees from the spec:
//   * Only one attempt can be in progress at a time (single-attempt guard).
//   * The full exam snapshot (with the answer key) stays in Main. The renderer
//     only ever receives sanitized questions during an active exam.
//   * The timer is computed from an absolute deadline (deadline - now), so it
//     stays correct through blur/minimize/reload and never resets.
//   * Finalization (scoring) happens exactly once.
//
// NOTE: disk persistence of attempts (attempts.json / active-attempt.json) is
// added in Phase 5. For Phase 3 the active attempt lives in Main memory, which
// is enough for renderer-reload recovery.

const crypto = require("crypto");
const examService = require("./examService.cjs");
const windowRef = require("../windowRef.cjs");

let activeAttempt = null; // the full attempt object (internal, includes answer key)
let timerInterval = null;
let starting = false; // synchronous lock to block simultaneous startExam calls

function isExamActive() {
  return !!activeAttempt && activeAttempt.status === "in_progress";
}

// Strip the answer key before sending questions to the renderer.
function getPublicQuestions(questions) {
  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options
  }));
}

// Sanitized view of the active attempt for the renderer (no correct answers).
function getActiveExam() {
  if (!isExamActive()) return null;
  const a = activeAttempt;
  return {
    attemptId: a.id,
    examId: a.examId,
    title: a.examSnapshot.title,
    subject: a.examSnapshot.subject,
    candidateName: a.candidateName,
    durationMinutes: a.examSnapshot.durationMinutes,
    deadline: a.deadline,
    remainingMs: Math.max(0, a.deadlineMs - Date.now()),
    questions: getPublicQuestions(a.examSnapshot.questions),
    answers: a.answers,
    markedForReview: a.markedForReview,
    monitoring: { active: false } // real monitoring status arrives in Phase 4
  };
}

async function startExam(examId, candidateName) {
  // Single-attempt guard: reject a second start, even after a renderer reload.
  if (isExamActive() || starting) {
    throw new Error("An examination is already in progress.");
  }
  starting = true;
  try {
    const name = typeof candidateName === "string" ? candidateName.trim() : "";
    if (!name) throw new Error("Please enter your name to begin the examination.");
    if (name.length > 80) throw new Error("Name is too long (max 80 characters).");

    const exam = await examService.getExamById(examId);
    if (!exam) throw new Error("Exam not found.");
    if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
      throw new Error("This exam has no questions.");
    }

    const now = Date.now();
    const deadlineMs = now + exam.durationMinutes * 60 * 1000;

    activeAttempt = {
      id: "attempt-" + crypto.randomUUID(),
      examId: exam.id,
      candidateName: name,
      // Immutable internal snapshot WITH the answer key. Never sent to renderer.
      examSnapshot: JSON.parse(JSON.stringify(exam)),
      startedAt: new Date(now).toISOString(),
      deadline: new Date(deadlineMs).toISOString(),
      deadlineMs,
      endedAt: null,
      status: "in_progress",
      answers: {}, // questionId -> selected option index
      markedForReview: [], // questionIds
      events: [], // monitoring timeline (Phase 4)
      result: null
    };

    startTimer();
    return getActiveExam();
  } finally {
    starting = false;
  }
}

function ensureActiveAndOpen() {
  if (!isExamActive()) throw new Error("No active examination.");
  if (Date.now() >= activeAttempt.deadlineMs) {
    throw new Error("The examination deadline has passed.");
  }
}

function findQuestion(questionId) {
  return activeAttempt.examSnapshot.questions.find((q) => q.id === questionId) || null;
}

// Save or change an answer. Validated entirely in Main - we never trust a
// renderer-supplied question object, only the id + index.
function saveAnswer(questionId, answerIndex) {
  ensureActiveAndOpen();
  const q = findQuestion(questionId);
  if (!q) throw new Error("Invalid question.");
  const idx = Number(answerIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
    throw new Error("Invalid answer selection.");
  }
  activeAttempt.answers[questionId] = idx;
  return { ok: true };
}

// Mark / unmark a question for review. Stored separately from answers, so a
// question can be both answered and marked.
function markForReview(questionId, marked) {
  ensureActiveAndOpen();
  const q = findQuestion(questionId);
  if (!q) throw new Error("Invalid question.");
  const list = activeAttempt.markedForReview;
  const has = list.includes(questionId);
  if (marked && !has) list.push(questionId);
  if (!marked && has) activeAttempt.markedForReview = list.filter((id) => id !== questionId);
  return { ok: true };
}

// Grade the attempt and build the result (with answer review). Correct answers
// are only revealed here, after finalization.
function buildResult() {
  const a = activeAttempt;
  const questions = a.examSnapshot.questions;
  let correct = 0;
  let attempted = 0;

  const review = questions.map((q) => {
    const selected = q.id in a.answers ? a.answers[q.id] : null;
    if (selected !== null) attempted++;
    const isCorrect = selected === q.correctAnswer;
    if (isCorrect) correct++;
    return {
      id: q.id,
      text: q.text,
      options: q.options,
      selected,
      correctAnswer: q.correctAnswer,
      isCorrect,
      explanation: q.explanation || ""
    };
  });

  const total = questions.length;
  const incorrect = attempted - correct;
  const unanswered = total - attempted;
  const startedMs = new Date(a.startedAt).getTime();
  const endedMs = a.endedAt ? new Date(a.endedAt).getTime() : Date.now();

  return {
    attemptId: a.id,
    examId: a.examId,
    title: a.examSnapshot.title,
    subject: a.examSnapshot.subject,
    candidateName: a.candidateName,
    status: a.status,
    submissionType: a.status === "auto_submitted" ? "auto" : "manual",
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    durationMinutes: a.examSnapshot.durationMinutes,
    totalQuestions: total,
    attempted,
    correct,
    incorrect,
    unanswered,
    score: correct,
    percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
    timeUsedMs: Math.max(0, endedMs - startedMs),
    review
  };
}

// Finalize exactly once. submissionType is "manual" or "auto".
function finalizeExam(submissionType) {
  if (!activeAttempt) return null;
  // Idempotent: if already finalized, just return the existing result.
  if (activeAttempt.status !== "in_progress") {
    return activeAttempt.result;
  }

  stopTimer();
  activeAttempt.status = submissionType === "auto" ? "auto_submitted" : "submitted";
  activeAttempt.endedAt = new Date().toISOString();
  activeAttempt.result = buildResult();

  // Notify the renderer that the exam is complete (covers auto-submit too).
  windowRef.sendToRenderer("exam:completed", activeAttempt.result);
  return activeAttempt.result;
}

function submitExam() {
  if (!activeAttempt) throw new Error("No active examination.");
  return finalizeExam("manual");
}

// ---- Authoritative timer (Main process) ----
function startTimer() {
  stopTimer();
  tick(); // send an immediate update
  timerInterval = setInterval(tick, 1000);
}

function tick() {
  if (!isExamActive()) {
    stopTimer();
    return;
  }
  const remainingMs = Math.max(0, activeAttempt.deadlineMs - Date.now());
  windowRef.sendToRenderer("timer:update", {
    attemptId: activeAttempt.id,
    remainingMs
  });
  if (remainingMs <= 0) {
    finalizeExam("auto"); // deadline reached -> auto submit
  }
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

module.exports = {
  isExamActive,
  startExam,
  getActiveExam,
  saveAnswer,
  markForReview,
  submitExam
};

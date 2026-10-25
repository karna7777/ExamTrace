// ExamTrace Server - Official attempts + server-side grading
//
// The server owns teacher-exam attempts: it issues a random credential, sets the
// official deadline, serves sanitized questions, and grades submissions. The answer
// key never leaves the server. Submission is idempotent (a repeat returns the stored
// result). Preview attempts (is_preview=1) are excluded from teacher results.

const crypto = require("crypto");
const { db } = require("./db.js");
const exams = require("./exams.js");

function summarizeEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const count = (t) => list.filter((e) => e.type === t).length;
  const sum = (types, key) =>
    list.filter((e) => types.includes(e.type)).reduce((a, e) => a + ((e.metadata && e.metadata[key]) || 0), 0);
  return {
    windowDepartures: count("WINDOW_BLUR") + count("WINDOW_MINIMIZED"),
    totalAwayMs: sum(["WINDOW_FOCUS", "WINDOW_RESTORED"], "awayMs"),
    fullscreenExits: count("FULLSCREEN_EXIT"),
    idleEvents: count("SYSTEM_IDLE"),
    totalIdleMs: sum(["SYSTEM_ACTIVE"], "idleMs"),
    lockEvents: count("SYSTEM_LOCKED"),
    suspendEvents: count("SYSTEM_SUSPENDED"),
    totalEvents: list.length
  };
}

// Start an official (or preview) attempt. Returns sanitized questions + deadline.
function start({ examId, candidateName, studentId, isPreview }) {
  const exam = exams.getFull(examId);
  if (!exam) {
    const e = new Error("Exam not found.");
    e.status = 404;
    throw e;
  }
  if (!isPreview && exam.status !== "published") {
    const e = new Error("This exam is not open.");
    e.status = 409;
    throw e;
  }
  const name = typeof candidateName === "string" ? candidateName.trim() : "";
  if (!isPreview && !name) {
    const e = new Error("Candidate name is required.");
    e.status = 400;
    throw e;
  }

  const now = Date.now();
  const deadlineMs = now + exam.durationMinutes * 60 * 1000;
  const id = "attempt-" + crypto.randomUUID();
  const credential = crypto.randomBytes(18).toString("hex");

  db.prepare(
    "INSERT INTO attempts (id, exam_id, candidate_name, student_id, credential, status, started_at, deadline, is_preview) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(
    id,
    examId,
    name,
    typeof studentId === "string" ? studentId.trim() : "",
    credential,
    "in_progress",
    new Date(now).toISOString(),
    new Date(deadlineMs).toISOString(),
    isPreview ? 1 : 0
  );

  return {
    attemptId: id,
    credential,
    deadline: new Date(deadlineMs).toISOString(),
    title: exam.title,
    subject: exam.subject,
    durationMinutes: exam.durationMinutes,
    questions: exam.questions.map((q) => ({ id: q.id, text: q.text, options: q.options }))
  };
}

// Grade + finalize. Idempotent: returns the stored result if already submitted.
function submit({ attemptId, credential, answers, events, auto }) {
  const row = db.prepare("SELECT * FROM attempts WHERE id = ?").get(attemptId);
  if (!row) {
    const e = new Error("Attempt not found.");
    e.status = 404;
    throw e;
  }
  if (row.credential !== credential) {
    const e = new Error("Invalid attempt credential.");
    e.status = 403;
    throw e;
  }
  if (row.status !== "in_progress") {
    return buildResult(row); // idempotent - already graded
  }

  const exam = exams.getFull(row.exam_id);
  const safeAnswers = answers && typeof answers === "object" ? answers : {};
  let correct = 0;
  let attempted = 0;
  const review = exam.questions.map((q) => {
    const selected = q.id in safeAnswers ? Number(safeAnswers[q.id]) : null;
    const hasAnswer = Number.isInteger(selected) && selected >= 0 && selected <= 3;
    if (hasAnswer) attempted++;
    const isCorrect = hasAnswer && selected === q.correctAnswer;
    if (isCorrect) correct++;
    return {
      id: q.id,
      text: q.text,
      options: q.options,
      selected: hasAnswer ? selected : null,
      correctAnswer: q.correctAnswer,
      isCorrect,
      explanation: q.explanation || ""
    };
  });

  const total = exam.questions.length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  const status = auto ? "auto_submitted" : "submitted";
  const endedAt = new Date().toISOString();
  const safeEvents = Array.isArray(events) ? events.slice(0, 500) : [];

  db.prepare(
    "UPDATE attempts SET status=?, answers_json=?, events_json=?, score=?, total=?, percentage=?, ended_at=? WHERE id=?"
  ).run(status, JSON.stringify(safeAnswers), JSON.stringify(safeEvents), correct, total, percentage, endedAt, attemptId);

  return buildResult(db.prepare("SELECT * FROM attempts WHERE id = ?").get(attemptId), review);
}

function buildResult(row, reviewMaybe) {
  const exam = exams.getFull(row.exam_id);
  const answers = row.answers_json ? JSON.parse(row.answers_json) : {};
  const events = row.events_json ? JSON.parse(row.events_json) : [];
  const review =
    reviewMaybe ||
    (exam
      ? exam.questions.map((q) => {
          const selected = q.id in answers ? Number(answers[q.id]) : null;
          const hasAnswer = Number.isInteger(selected);
          return {
            id: q.id,
            text: q.text,
            options: q.options,
            selected: hasAnswer ? selected : null,
            correctAnswer: q.correctAnswer,
            isCorrect: hasAnswer && selected === q.correctAnswer,
            explanation: q.explanation || ""
          };
        })
      : []);
  const total = row.total != null ? row.total : exam ? exam.questions.length : 0;
  const correct = row.score || 0;
  const attempted = review.filter((r) => r.selected !== null).length;
  const startedMs = new Date(row.started_at).getTime();
  const endedMs = row.ended_at ? new Date(row.ended_at).getTime() : Date.now();
  return {
    attemptId: row.id,
    examId: row.exam_id,
    title: exam ? exam.title : "Examination",
    subject: exam ? exam.subject : "",
    candidateName: row.candidate_name,
    studentId: row.student_id,
    status: row.status,
    submissionType: row.status === "auto_submitted" ? "auto" : "manual",
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMinutes: exam ? exam.durationMinutes : 0,
    totalQuestions: total,
    attempted,
    correct,
    incorrect: attempted - correct,
    unanswered: total - attempted,
    score: correct,
    percentage: row.percentage || 0,
    timeUsedMs: Math.max(0, endedMs - startedMs),
    review,
    events,
    monitoringSummary: summarizeEvents(events),
    isPreview: !!row.is_preview,
    source: "teacher"
  };
}

// Teacher results list (official attempts only, newest first).
function resultsList() {
  const rows = db
    .prepare("SELECT * FROM attempts WHERE is_preview = 0 AND status != 'in_progress' ORDER BY ended_at DESC")
    .all();
  return rows.map((r) => {
    const events = r.events_json ? JSON.parse(r.events_json) : [];
    return {
      attemptId: r.id,
      examId: r.exam_id,
      candidateName: r.candidate_name,
      studentId: r.student_id,
      score: r.score || 0,
      totalQuestions: r.total || 0,
      percentage: r.percentage || 0,
      submissionType: r.status === "auto_submitted" ? "auto" : "manual",
      endedAt: r.ended_at,
      monitoringEvents: events.length
    };
  });
}

function resultDetail(attemptId) {
  const row = db.prepare("SELECT * FROM attempts WHERE id = ? AND is_preview = 0").get(attemptId);
  if (!row) return null;
  return buildResult(row);
}

module.exports = { start, submit, resultsList, resultDetail };

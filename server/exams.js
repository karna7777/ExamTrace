// ExamTrace Server - Exam storage & validation
//
// Teacher exams are stored with their answer keys in questions_json. Student-facing
// helpers return only sanitized data (no correct answers).

const crypto = require("crypto");
const { db } = require("./db.js");

// Mirror the app's validation rules so published exams are well-formed.
function validate(exam) {
  if (!exam || typeof exam !== "object") return "Invalid exam data.";
  if (typeof exam.title !== "string" || !exam.title.trim()) return "Exam title is required.";
  const d = Number(exam.durationMinutes);
  if (!Number.isFinite(d) || d <= 0) return "Duration must be a positive number of minutes.";
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) return "At least one question is required.";
  for (let i = 0; i < exam.questions.length; i++) {
    const q = exam.questions[i];
    const n = i + 1;
    if (!q || typeof q.text !== "string" || !q.text.trim()) return "Question " + n + " needs text.";
    if (!Array.isArray(q.options) || q.options.length !== 4) return "Question " + n + " must have 4 options.";
    for (let j = 0; j < 4; j++) {
      if (typeof q.options[j] !== "string" || !q.options[j].trim()) return "Question " + n + " has an empty option.";
    }
    const ca = Number(q.correctAnswer);
    if (!Number.isInteger(ca) || ca < 0 || ca > 3) return "Question " + n + " needs one correct answer.";
  }
  return null;
}

// Create or update (upsert) and mark published.
function publish(exam) {
  const err = validate(exam);
  if (err) {
    const e = new Error(err);
    e.status = 400;
    throw e;
  }
  const now = new Date().toISOString();
  const id = typeof exam.id === "string" && exam.id ? exam.id : "exam-" + crypto.randomUUID();
  const questions = exam.questions.map((q) => ({
    id: typeof q.id === "string" && q.id ? q.id : "q-" + crypto.randomUUID(),
    text: q.text.trim(),
    options: q.options.map((o) => o.trim()),
    correctAnswer: Number(q.correctAnswer),
    explanation: typeof q.explanation === "string" ? q.explanation.trim() : ""
  }));
  const qJson = JSON.stringify(questions);
  const existing = db.prepare("SELECT id, created_at FROM exams WHERE id = ?").get(id);
  if (existing) {
    db.prepare(
      "UPDATE exams SET title=?, subject=?, description=?, duration_minutes=?, questions_json=?, status='published', updated_at=? WHERE id=?"
    ).run(exam.title.trim(), exam.subject || "", exam.description || "", Number(exam.durationMinutes), qJson, now, id);
  } else {
    db.prepare(
      "INSERT INTO exams (id, title, subject, description, duration_minutes, questions_json, status, created_at, updated_at) VALUES (?,?,?,?,?,?, 'published', ?, ?)"
    ).run(id, exam.title.trim(), exam.subject || "", exam.description || "", Number(exam.durationMinutes), qJson, now, now);
  }
  return { id };
}

function close(id) {
  db.prepare("UPDATE exams SET status='closed', updated_at=? WHERE id=?").run(new Date().toISOString(), id);
  return { ok: true };
}

// Student-facing list: published exams, metadata only (no questions/answers).
function listPublic() {
  const rows = db.prepare("SELECT id, title, subject, description, duration_minutes, questions_json FROM exams WHERE status='published'").all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subject,
    description: r.description,
    durationMinutes: r.duration_minutes,
    questionCount: JSON.parse(r.questions_json).length,
    source: "teacher"
  }));
}

// Teacher-facing list (their own exams, incl. status).
function listOwned() {
  const rows = db.prepare("SELECT id, title, subject, duration_minutes, status, questions_json FROM exams").all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subject,
    durationMinutes: r.duration_minutes,
    status: r.status,
    questionCount: JSON.parse(r.questions_json).length
  }));
}

function getFull(id) {
  const r = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    subject: r.subject,
    description: r.description,
    durationMinutes: r.duration_minutes,
    status: r.status,
    questions: JSON.parse(r.questions_json)
  };
}

// Questions with NO answer key - used when a student starts an attempt.
function sanitizedQuestions(id) {
  const full = getFull(id);
  if (!full) return null;
  return full.questions.map((q) => ({ id: q.id, text: q.text, options: q.options }));
}

module.exports = { validate, publish, close, listPublic, listOwned, getFull, sanitizedQuestions };

// ExamTrace - Exam Service
//
// Owns exam definitions in exams.json: validation, create/update, delete,
// candidate-safe listing (never leaks correct answers), and one-time seeding
// of the built-in sample exam.

const crypto = require("crypto");
const storage = require("./storageService.cjs");
const settingsService = require("./settingsService.cjs");

const EXAMS_FILE = "exams.json";

async function readExams() {
  const list = await storage.readJson(EXAMS_FILE, []);
  return Array.isArray(list) ? list : [];
}

// Validate an exam. Returns an error message string, or null if valid.
function validateExam(exam) {
  if (!exam || typeof exam !== "object") return "Invalid exam data.";

  const title = typeof exam.title === "string" ? exam.title.trim() : "";
  if (!title) return "Exam title is required.";

  const duration = Number(exam.durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return "Duration must be a positive number of minutes.";
  }

  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    return "At least one question is required.";
  }

  for (let i = 0; i < exam.questions.length; i++) {
    const q = exam.questions[i];
    const n = i + 1;
    if (!q || typeof q.text !== "string" || !q.text.trim()) {
      return "Question " + n + " needs question text.";
    }
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return "Question " + n + " must have exactly 4 options.";
    }
    for (let j = 0; j < 4; j++) {
      if (typeof q.options[j] !== "string" || !q.options[j].trim()) {
        return "Question " + n + " option " + (j + 1) + " must not be empty.";
      }
    }
    const ca = Number(q.correctAnswer);
    if (!Number.isInteger(ca) || ca < 0 || ca > 3) {
      return "Question " + n + " must have exactly one correct answer selected.";
    }
  }
  return null;
}

// Produce a clean, normalized exam object with trimmed values and stable IDs.
function normalizeExam(exam, existing) {
  const now = new Date().toISOString();
  const id = existing ? existing.id : "exam-" + crypto.randomUUID();

  const questions = exam.questions.map((q) => ({
    id:
      typeof q.id === "string" && q.id.startsWith("question-")
        ? q.id
        : "question-" + crypto.randomUUID(),
    text: q.text.trim(),
    options: q.options.map((o) => o.trim()),
    correctAnswer: Number(q.correctAnswer),
    explanation: typeof q.explanation === "string" ? q.explanation.trim() : ""
  }));

  return {
    id,
    title: exam.title.trim(),
    subject: typeof exam.subject === "string" ? exam.subject.trim() : "",
    description: typeof exam.description === "string" ? exam.description.trim() : "",
    durationMinutes: Number(exam.durationMinutes),
    questions,
    isSample: existing ? !!existing.isSample : !!exam.isSample,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now
  };
}

// Create or update an exam. (Authorization is enforced in the IPC layer.)
async function saveExam(exam) {
  const problem = validateExam(exam);
  if (problem) {
    const e = new Error(problem);
    e.code = "VALIDATION";
    throw e;
  }

  const exams = await readExams();
  const existing = exam.id ? exams.find((e) => e.id === exam.id) || null : null;
  const normalized = normalizeExam(exam, existing);

  const next = existing
    ? exams.map((e) => (e.id === normalized.id ? normalized : e))
    : exams.concat(normalized);

  await storage.writeJson(EXAMS_FILE, next);
  return { ok: true, exam: normalized };
}

// Delete only the exam definition. Historical attempts are stored separately
// (Phase 5) and are never touched here.
async function deleteExam(examId) {
  const exams = await readExams();
  const next = exams.filter((e) => e.id !== examId);
  await storage.writeJson(EXAMS_FILE, next);
  return { ok: true };
}

// Candidate-safe listing: metadata only. Never includes questions, correct
// answers or explanations.
async function getAvailableExams() {
  const exams = await readExams();
  return exams.map((e) => ({
    id: e.id,
    title: e.title,
    subject: e.subject,
    description: e.description,
    questionCount: Array.isArray(e.questions) ? e.questions.length : 0,
    durationMinutes: e.durationMinutes,
    isSample: !!e.isSample
  }));
}

// Examiner-only: full exam including the answer key, for editing.
async function getExamForEdit(examId) {
  const exams = await readExams();
  const exam = exams.find((e) => e.id === examId);
  if (!exam) throw new Error("Exam not found.");
  return exam;
}

async function getExamById(examId) {
  const exams = await readExams();
  return exams.find((e) => e.id === examId) || null;
}

// The built-in demo exam. Questions are manually verified.
function buildSampleExam() {
  const now = new Date().toISOString();
  const q = (text, options, correctAnswer, explanation) => ({
    id: "question-" + crypto.randomUUID(),
    text,
    options,
    correctAnswer,
    explanation
  });

  return {
    id: "exam-" + crypto.randomUUID(),
    title: "Computer Science Fundamentals",
    subject: "Computer Science",
    description: "A short built-in practice exam covering core CS topics.",
    durationMinutes: 3,
    isSample: true,
    createdAt: now,
    updatedAt: now,
    questions: [
      q(
        "What does CPU stand for?",
        ["Central Processing Unit", "Computer Personal Unit", "Central Process Utility", "Core Processing Unit"],
        0,
        "CPU stands for Central Processing Unit, the main processor of a computer."
      ),
      q(
        "Which CPU scheduling approach can cause long processes to starve if short jobs keep arriving?",
        ["First Come First Served", "Shortest Job First", "Round Robin", "FIFO"],
        1,
        "Shortest Job First favours short jobs, so a steady stream of them can starve longer processes."
      ),
      q(
        "What does SQL stand for?",
        ["Structured Query Language", "Simple Query Language", "Sequential Query Language", "Standard Question Language"],
        0,
        "SQL stands for Structured Query Language, used to manage relational databases."
      ),
      q(
        "In a relational database, a primary key must be:",
        ["Unique and not null", "Allowed to repeat", "Always a foreign key", "Always numeric"],
        0,
        "A primary key uniquely identifies each row, so it must be unique and cannot be null."
      ),
      q(
        "Which OSI model layer is responsible for routing packets between networks?",
        ["Transport layer", "Network layer", "Data Link layer", "Session layer"],
        1,
        "The Network layer (Layer 3) handles logical addressing and routing of packets."
      ),
      q(
        "What is the default port number for HTTP?",
        ["21", "25", "80", "443"],
        2,
        "HTTP uses port 80 by default; HTTPS uses 443."
      ),
      q(
        "Which data structure follows the First In First Out (FIFO) principle?",
        ["Stack", "Queue", "Tree", "Graph"],
        1,
        "A queue removes elements in the same order they were added (FIFO). A stack is LIFO."
      ),
      q(
        "What is the time complexity of binary search on a sorted array of n elements?",
        ["O(n)", "O(log n)", "O(n^2)", "O(1)"],
        1,
        "Binary search halves the search range each step, giving O(log n)."
      ),
      q(
        "In programming, a variable is best described as:",
        ["A fixed constant", "A named storage location for a value", "A type of loop", "A built-in function"],
        1,
        "A variable is a named location in memory that holds a value which can change."
      ),
      q(
        "Which of the following is a non-volatile memory?",
        ["RAM", "Cache", "ROM", "CPU Register"],
        2,
        "ROM retains its contents without power (non-volatile); RAM, cache and registers are volatile."
      )
    ]
  };
}

// Seed the sample exam exactly once, and only after examiner setup has
// succeeded. If the examiner later deletes it, the marker stays set so it is
// never recreated.
async function seedSampleExamIfNeeded() {
  const settings = await settingsService.getSettings();
  if (settings.sampleExamSeeded) return { seeded: false };

  const exams = await readExams();
  const sample = buildSampleExam();
  await storage.writeJson(EXAMS_FILE, exams.concat(sample));
  await settingsService.markSampleSeeded();
  return { seeded: true };
}

module.exports = {
  readExams,
  validateExam,
  saveExam,
  deleteExam,
  getAvailableExams,
  getExamForEdit,
  getExamById,
  seedSampleExamIfNeeded
};

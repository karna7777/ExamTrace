// ExamTrace Server - Database (SQLite via Node's built-in node:sqlite)
//
// Zero-dependency database layer. node:sqlite ships with Node >= 22.5 (verified on
// this project's system Node), so there is no native module to compile or rebuild.
// The DB file lives in server/data/ (writable, gitignored). Deleting that file
// resets all backend data.

const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

// DB location: defaults to server/data/examtrace.db. EXAMTRACE_DB can override it
// (useful for tests or relocating data).
const DB_PATH = process.env.EXAMTRACE_DB || path.join(__dirname, "data", "examtrace.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Enforce foreign keys (off by default in SQLite).
db.exec("PRAGMA foreign_keys = ON");

// Minimal schema. For this academic prototype there is a single teacher account,
// so exams/attempts do not need a per-teacher owner column.
db.exec(`
  CREATE TABLE IF NOT EXISTS teachers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    salt          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exams (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    subject          TEXT,
    description      TEXT,
    duration_minutes INTEGER NOT NULL,
    questions_json   TEXT NOT NULL,            -- options + correct answers (server-only)
    status           TEXT NOT NULL DEFAULT 'published', -- 'published' | 'closed'
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attempts (
    id             TEXT PRIMARY KEY,
    exam_id        TEXT NOT NULL REFERENCES exams(id),
    candidate_name TEXT,
    student_id     TEXT,
    credential     TEXT NOT NULL,             -- random secret to authorize submission
    status         TEXT NOT NULL,             -- 'in_progress' | 'submitted' | 'auto_submitted'
    started_at     TEXT NOT NULL,
    deadline       TEXT NOT NULL,
    answers_json   TEXT,
    events_json    TEXT,
    score          INTEGER,
    total          INTEGER,
    percentage     INTEGER,
    is_preview     INTEGER NOT NULL DEFAULT 0,
    ended_at       TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts(exam_id);
`);

module.exports = { db, DB_PATH };

// ExamTrace Server - Teacher Authentication
//
// Simple, LAN-appropriate authentication for an academic prototype:
//   * One teacher account, created once via localhost-only setup.
//   * Password stored as a scrypt hash with a random salt (never plaintext, no
//     default password).
//   * Login verifies with crypto.timingSafeEqual and issues a random session token.
//   * Sessions are kept in an in-memory map with an expiry (reset on server restart).
//
// Honest limitation: over plain HTTP on a shared network the password and token are
// observable, so this assumes a trusted classroom LAN. HTTPS is out of scope here.

const crypto = require("crypto");
const { db } = require("./db.js");

const KEYLEN = 64;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// token -> { username, expiresAt }
const sessions = new Map();

function deriveHash(password, saltBuffer) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, saltBuffer, KEYLEN, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

function teacherExists() {
  return !!db.prepare("SELECT 1 FROM teachers LIMIT 1").get();
}

// Create the single teacher account. Caller (index.js) enforces localhost-only.
async function setupTeacher(username, password) {
  if (teacherExists()) {
    const e = new Error("A teacher account already exists on this server.");
    e.status = 409;
    throw e;
  }
  if (typeof username !== "string" || !username.trim()) {
    const e = new Error("A username is required.");
    e.status = 400;
    throw e;
  }
  if (typeof password !== "string" || password.length < 6) {
    const e = new Error("Password must be at least 6 characters.");
    e.status = 400;
    throw e;
  }
  const salt = crypto.randomBytes(16);
  const hash = await deriveHash(password, salt);
  db.prepare(
    "INSERT INTO teachers (username, salt, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run(username.trim(), salt.toString("hex"), hash.toString("hex"), new Date().toISOString());
  return { ok: true };
}

// Verify credentials and issue a session token, or return null on failure.
async function login(username, password) {
  if (typeof username !== "string" || typeof password !== "string") return null;
  const row = db.prepare("SELECT * FROM teachers WHERE username = ?").get(username.trim());
  if (!row) return null;

  const salt = Buffer.from(row.salt, "hex");
  const stored = Buffer.from(row.password_hash, "hex");
  const derived = await deriveHash(password, salt);
  if (derived.length !== stored.length || !crypto.timingSafeEqual(derived, stored)) {
    return null;
  }

  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { username: row.username, expiresAt: Date.now() + SESSION_TTL_MS });
  return { token };
}

function validateToken(token) {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function logout(token) {
  sessions.delete(token);
  return { ok: true };
}

module.exports = { teacherExists, setupTeacher, login, validateToken, logout };

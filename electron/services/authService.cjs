// ExamTrace - Examiner Authentication Service
//
// Handles the examiner passcode: first-run setup, unlock, lock, and passcode
// change. The passcode is NEVER stored in plaintext. We derive a hash with
// Node's crypto.scrypt using a random per-install salt, and verify with
// crypto.timingSafeEqual (constant-time, resists timing attacks).
//
// The unlocked state lives only in memory, so restarting the app always
// returns to the locked (Candidate) state automatically.

const crypto = require("crypto");
const storage = require("./storageService.cjs");

const AUTH_FILE = "examiner-auth.json";
// Other data files whose presence means this is NOT a genuine first run.
const OTHER_DATA_FILES = ["exams.json", "attempts.json", "active-attempt.json"];
const KEYLEN = 64; // scrypt derived-key length in bytes

// In-memory state (resets on every app restart).
let examinerUnlocked = false;
let failedAttempts = 0;
let lockedUntil = 0; // timestamp (ms) until which unlock is temporarily blocked

function isUnlocked() {
  return examinerUnlocked;
}

async function isConfigured() {
  return storage.fileExists(AUTH_FILE);
}

// True if any real app data exists. Used to detect the "missing auth file but
// data present" recovery situation, which must NOT be treated as a first run.
async function anyAppDataExists() {
  for (const f of OTHER_DATA_FILES) {
    if (await storage.fileExists(f)) return true;
  }
  return false;
}

// Reject obviously weak passcodes. Kept simple and explainable.
function validatePasscode(passcode) {
  if (typeof passcode !== "string") return "Passcode is required.";
  if (passcode.length < 6) return "Passcode must be at least 6 characters.";
  if (passcode.length > 128) return "Passcode is too long.";
  if (/^(.)\1+$/.test(passcode)) return "Passcode cannot be a single repeated character.";
  return null; // valid
}

// Promisified scrypt so we can use async/await.
function deriveHash(passcode, saltBuffer) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(passcode, saltBuffer, KEYLEN, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

function makeAuthRecord(passcode, saltBuffer, hashBuffer) {
  return {
    algorithm: "scrypt",
    keylen: KEYLEN,
    salt: saltBuffer.toString("hex"),
    passwordHash: hashBuffer.toString("hex"),
    updatedAt: new Date().toISOString()
  };
}

// First-time setup. Allowed ONLY when there is no auth file and no other data.
async function setup(passcode) {
  if (await isConfigured()) {
    throw new Error("Examiner authentication is already configured.");
  }
  // Recovery guard: auth missing but other data present = do not re-register.
  if (await anyAppDataExists()) {
    const e = new Error(
      "Existing application data was found but the examiner authentication file is missing. " +
        "For safety a new passcode cannot be created. (Authentication recovery error.)"
    );
    e.code = "AUTH_RECOVERY";
    throw e;
  }
  const problem = validatePasscode(passcode);
  if (problem) throw new Error(problem);

  const salt = crypto.randomBytes(16);
  const hash = await deriveHash(passcode, salt);
  await storage.writeJson(AUTH_FILE, makeAuthRecord(passcode, salt, hash));
  // Setup does NOT auto-unlock; the app opens in Candidate Mode afterwards.
  return { ok: true };
}

// Verify a passcode against the stored salt+hash using a constant-time compare.
async function verify(passcode) {
  if (typeof passcode !== "string" || passcode.length === 0) return false;
  const auth = await storage.readJson(AUTH_FILE, null);
  if (!auth || !auth.salt || !auth.passwordHash) {
    const e = new Error("Examiner authentication data is missing or unreadable.");
    e.code = "AUTH_RECOVERY";
    throw e;
  }
  const salt = Buffer.from(auth.salt, "hex");
  const stored = Buffer.from(auth.passwordHash, "hex");
  const derived = await deriveHash(passcode, salt);
  // timingSafeEqual requires equal-length buffers, so check length first.
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

// Unlock Examiner Mode with simple attempt limiting to slow brute force.
async function unlock(passcode) {
  const now = Date.now();
  if (now < lockedUntil) {
    const secs = Math.ceil((lockedUntil - now) / 1000);
    throw new Error("Too many attempts. Please wait " + secs + " seconds and try again.");
  }

  const ok = await verify(passcode);
  if (!ok) {
    failedAttempts++;
    // Small fixed delay on every failure.
    await new Promise((r) => setTimeout(r, 400));
    if (failedAttempts >= 5) {
      lockedUntil = Date.now() + 30000; // 30-second cooldown
      failedAttempts = 0;
    }
    return { ok: false };
  }

  failedAttempts = 0;
  examinerUnlocked = true;
  return { ok: true };
}

function lock() {
  examinerUnlocked = false;
  return { ok: true };
}

// Change the passcode. Requires the current passcode to be correct and the
// examiner to be unlocked. Authorization is also enforced in the IPC layer.
async function changePasscode(current, next) {
  if (!examinerUnlocked) throw new Error("Examiner access required.");
  const ok = await verify(current);
  if (!ok) throw new Error("Current passcode is incorrect.");
  const problem = validatePasscode(next);
  if (problem) throw new Error(problem);

  const salt = crypto.randomBytes(16);
  const hash = await deriveHash(next, salt);
  await storage.writeJson(AUTH_FILE, makeAuthRecord(next, salt, hash));
  return { ok: true };
}

module.exports = {
  isUnlocked,
  isConfigured,
  anyAppDataExists,
  setup,
  verify,
  unlock,
  lock,
  changePasscode
};

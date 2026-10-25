// ExamTrace Server - Express entry point
//
// Runs on the teacher's computer with system Node.js (node:sqlite needs Node >= 22.5).
// It is NOT embedded in the packaged Electron app - start it separately:
//   npm run server       -> localhost only (127.0.0.1)
//   npm run server:lan   -> also reachable by other devices on the same LAN
//
// B1 scope: health check + teacher account setup (localhost-only) + login/logout.
// Exam publishing, attempts and results are added in later phases.

const express = require("express");
const os = require("os");
const auth = require("./auth.js");
const exams = require("./exams.js");
const attempts = require("./attempts.js");
const { DB_PATH } = require("./db.js");

const PORT = Number(process.env.PORT) || 3000;
const LAN = process.env.EXAMTRACE_LAN === "1";
const HOST = LAN ? "0.0.0.0" : "127.0.0.1";

const app = express();
app.use(express.json({ limit: "2mb" }));

// Is the request coming from the teacher's own computer?
function isLocalRequest(req) {
  const ip = req.socket.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

// Protect teacher-only routes with the Bearer session token.
function requireTeacher(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!auth.validateToken(token)) {
    return res.status(401).json({ ok: false, error: "Teacher authentication required." });
  }
  req.token = token;
  next();
}

// ---- Routes ----
app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "ExamTrace Server" });
});

// Whether the single teacher account has been created yet.
app.get("/api/teacher/exists", (req, res) => {
  res.json({ exists: auth.teacherExists() });
});

// First-time account creation - allowed ONLY from the teacher's own machine, so a
// different device on the LAN cannot claim the teacher account.
app.post("/api/teacher/setup", async (req, res) => {
  if (!isLocalRequest(req)) {
    return res.status(403).json({
      ok: false,
      error: "Teacher setup is only allowed on the teacher's own computer (localhost)."
    });
  }
  try {
    const { username, password } = req.body || {};
    await auth.setupTeacher(username, password);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
  }
});

app.post("/api/teacher/login", async (req, res) => {
  const { username, password } = req.body || {};
  const result = await auth.login(username, password);
  if (!result) {
    return res.status(401).json({ ok: false, error: "Invalid username or password." });
  }
  res.json({ ok: true, token: result.token });
});

app.post("/api/teacher/logout", requireTeacher, (req, res) => {
  auth.logout(req.token);
  res.json({ ok: true });
});

app.get("/api/teacher/session", requireTeacher, (req, res) => {
  res.json({ ok: true });
});

// ---- Exams ----
// Student-facing: published exams, metadata only (no answer keys).
app.get("/api/exams", (req, res) => {
  res.json(exams.listPublic());
});

// Teacher's own exams (incl. status).
app.get("/api/teacher/exams", requireTeacher, (req, res) => {
  res.json(exams.listOwned());
});

// Publish / update an exam.
app.post("/api/teacher/exams", requireTeacher, (req, res) => {
  try {
    const result = exams.publish(req.body || {});
    res.json({ ok: true, id: result.id });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
  }
});

// Close (unpublish) an exam.
app.post("/api/teacher/exams/:id/close", requireTeacher, (req, res) => {
  exams.close(req.params.id);
  res.json({ ok: true });
});

// ---- Attempts (official, server-graded) ----
app.post("/api/attempts/start", (req, res) => {
  try {
    const { examId, candidateName, studentId } = req.body || {};
    res.json({ ok: true, ...attempts.start({ examId, candidateName, studentId, isPreview: false }) });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
  }
});

app.post("/api/attempts/:id/submit", (req, res) => {
  try {
    const { credential, answers, events, auto } = req.body || {};
    const result = attempts.submit({ attemptId: req.params.id, credential, answers, events, auto });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
  }
});

// Teacher preview: a teacher-authenticated attempt that never appears in results.
app.post("/api/teacher/preview/start", requireTeacher, (req, res) => {
  try {
    const { examId } = req.body || {};
    res.json({ ok: true, ...attempts.start({ examId, candidateName: "Preview", studentId: "", isPreview: true }) });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
  }
});

// ---- Teacher results ----
app.get("/api/teacher/results", requireTeacher, (req, res) => {
  res.json(attempts.resultsList());
});

app.get("/api/teacher/results/:attemptId", requireTeacher, (req, res) => {
  const detail = attempts.resultDetail(req.params.attemptId);
  if (!detail) return res.status(404).json({ ok: false, error: "Result not found." });
  res.json(detail);
});

// Simple landing page so a teacher can confirm the server is up in a browser.
app.get("/", (req, res) => {
  res.type("html").send(
    "<!doctype html><meta charset=utf-8><title>ExamTrace Server</title>" +
      "<body style=\"font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#0f172a\">" +
      "<h1>ExamTrace Server</h1><p style=\"color:#16a34a;font-weight:600\">&#9679; Running</p>" +
      "<p>Open the ExamTrace app and connect to this address.</p>"
  );
});

app.listen(PORT, HOST, () => {
  console.log("\n  ExamTrace server running.");
  console.log("  Database: " + DB_PATH);
  console.log("  Local:    http://127.0.0.1:" + PORT);
  if (LAN) {
    const nics = os.networkInterfaces();
    for (const name of Object.keys(nics)) {
      for (const nic of nics[name] || []) {
        if (nic.family === "IPv4" && !nic.internal) {
          console.log("  LAN:      http://" + nic.address + ":" + PORT + "  (" + name + ")");
        }
      }
    }
  } else {
    console.log("  (localhost only - run `npm run server:lan` to allow other devices)");
  }
  console.log("");
});

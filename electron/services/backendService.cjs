// ExamTrace - Backend Service (Electron Main)
//
// All HTTP to the optional teacher server happens here, in the Main process (never
// the renderer - the renderer's CSP would block it). Holds the server URL and the
// teacher session token in Main memory only. Every call returns { ok, data } or
// { ok:false, error } and never throws, so the app degrades gracefully when the
// server is down.

let serverUrl = "";
let token = ""; // teacher session token (memory only)

function setServerUrl(url) {
  serverUrl = (url || "").trim().replace(/\/+$/, "");
}
function getServerUrl() {
  return serverUrl;
}
function isTeacherLoggedIn() {
  return !!token;
}
function clearSession() {
  token = "";
}

async function request(method, path, options = {}) {
  if (!serverUrl) return { ok: false, error: "No server configured." };
  try {
    const headers = { "Content-Type": "application/json" };
    if (options.auth && token) headers.Authorization = "Bearer " + token;
    const res = await fetch(serverUrl + path, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(6000)
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: (data && data.error) || "Request failed (" + res.status + ")." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

// ---- connection / auth ----
async function health() {
  return request("GET", "/api/health");
}
async function teacherExists() {
  return request("GET", "/api/teacher/exists");
}
async function teacherSetup(username, password) {
  return request("POST", "/api/teacher/setup", { body: { username, password } });
}
async function teacherLogin(username, password) {
  const r = await request("POST", "/api/teacher/login", { body: { username, password } });
  if (r.ok && r.data && r.data.token) token = r.data.token;
  return r.ok ? { ok: true } : r;
}
async function teacherLogout() {
  await request("POST", "/api/teacher/logout", { auth: true });
  clearSession();
  return { ok: true };
}

// ---- exams ----
async function getPublicExams() {
  return request("GET", "/api/exams"); // student-facing metadata
}
async function getOwnedExams() {
  return request("GET", "/api/teacher/exams", { auth: true });
}
async function publishExam(exam) {
  return request("POST", "/api/teacher/exams", { body: exam, auth: true });
}
async function closeExam(id) {
  return request("POST", "/api/teacher/exams/" + encodeURIComponent(id) + "/close", { auth: true });
}

// ---- attempts ----
async function startAttempt(examId, candidateName, studentId) {
  return request("POST", "/api/attempts/start", { body: { examId, candidateName, studentId } });
}
async function startPreview(examId) {
  return request("POST", "/api/teacher/preview/start", { body: { examId }, auth: true });
}
async function submitAttempt(attemptId, credential, answers, events, auto) {
  return request("POST", "/api/attempts/" + encodeURIComponent(attemptId) + "/submit", {
    body: { credential, answers, events, auto: !!auto }
  });
}

// ---- results ----
async function getResults() {
  return request("GET", "/api/teacher/results", { auth: true });
}
async function getResultDetail(attemptId) {
  return request("GET", "/api/teacher/results/" + encodeURIComponent(attemptId), { auth: true });
}

module.exports = {
  setServerUrl,
  getServerUrl,
  isTeacherLoggedIn,
  clearSession,
  health,
  teacherExists,
  teacherSetup,
  teacherLogin,
  teacherLogout,
  getPublicExams,
  getOwnedExams,
  publishExam,
  closeExam,
  startAttempt,
  startPreview,
  submitAttempt,
  getResults,
  getResultDetail
};

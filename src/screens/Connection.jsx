// Connection screen (optional connected mode).
// - Anyone can enter a teacher server URL and test/connect (students need this to
//   see teacher exams).
// - On the teacher's own machine, a teacher account can be created (localhost-only,
//   enforced by the server) and logged in to publish exams and view results.
// Standalone mode = simply never connect here.
import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Connection({ onChanged }) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("unknown"); // unknown | connected | unreachable
  const [teacherExists, setTeacherExists] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    async function init() {
      const c = await api.net.getConnection();
      setUrl(c.serverUrl || "");
      setLoggedIn(!!c.teacherLoggedIn);
      if (c.serverUrl) await refreshStatus();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshStatus() {
    const h = await api.net.getConnection();
    setLoggedIn(!!h.teacherLoggedIn);
    const exists = await api.net.teacherExists();
    if (exists.ok) {
      setStatus("connected");
      setTeacherExists(!!exists.data.exists);
    } else {
      setStatus("unreachable");
      setTeacherExists(null);
    }
  }

  async function handleConnect() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await api.net.connect(url);
      if (res.ok) {
        setStatus("connected");
        await refreshStatus();
        setMessage("Connected to the teacher server.");
      } else {
        setStatus("unreachable");
        setError(res.error || "Could not reach the server.");
      }
      onChanged && onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    await api.net.disconnect();
    setStatus("unknown");
    setTeacherExists(null);
    setLoggedIn(false);
    setMessage("Disconnected. Local exams remain available.");
    onChanged && onChanged();
  }

  async function handleSetup(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const r = await api.net.teacherSetup({ username, password });
      if (!r.ok) {
        setError(r.error || "Setup failed.");
        return;
      }
      const login = await api.net.teacherLogin({ username, password });
      if (login.ok) {
        setLoggedIn(true);
        setTeacherExists(true);
        setPassword("");
        setMessage("Teacher account created and logged in.");
        onChanged && onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const r = await api.net.teacherLogin({ username, password });
      if (r.ok) {
        setLoggedIn(true);
        setPassword("");
        setMessage("Logged in as teacher.");
        onChanged && onChanged();
      } else {
        setError(r.error || "Login failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await api.net.teacherLogout();
    setLoggedIn(false);
    setMessage("Logged out of teacher mode.");
    onChanged && onChanged();
  }

  return (
    <div>
      <section className="panel">
        <h2>Teacher server</h2>
        <p className="muted">
          Optional. Connect to a teacher's ExamTrace server to see published teacher exams.
          Leaving this blank keeps ExamTrace fully local. Your local exams are always available.
        </p>
        <label className="field-label">Server address</label>
        <input
          className="text-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:3000  (or http://<teacher-ip>:3000)"
        />
        <div className="exam-actions" style={{ marginTop: 4 }}>
          <button className="btn btn-primary" onClick={handleConnect} disabled={busy || !url.trim()}>
            {busy ? "Connecting..." : "Connect"}
          </button>
          <button className="btn btn-ghost" onClick={handleDisconnect} disabled={busy}>
            Disconnect
          </button>
          <span className={"conn-pill " + status}>
            {status === "connected" ? "Connected" : status === "unreachable" ? "Unreachable" : "Not connected"}
          </span>
        </div>
        {error && <p className="status error">{error}</p>}
        {message && <p className="status success">{message}</p>}
      </section>

      {status === "connected" && (
        <section className="panel">
          <h2>Teacher login</h2>
          {loggedIn ? (
            <>
              <p className="muted">You are logged in as a teacher. You can publish exams and view results.</p>
              <button className="btn btn-ghost" onClick={handleLogout}>
                Log out of teacher mode
              </button>
            </>
          ) : (
            <form onSubmit={teacherExists ? handleLogin : handleSetup} className="narrow-form">
              <p className="muted">
                {teacherExists
                  ? "Enter your teacher credentials."
                  : "No teacher account exists yet. Create one (only possible on the teacher's own computer)."}
              </p>
              <label className="field-label">Username</label>
              <input className="text-input" value={username} onChange={(e) => setUsername(e.target.value)} />
              <label className="field-label">Password</label>
              <input
                type="password"
                className="text-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {teacherExists ? "Log in" : "Create teacher account"}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

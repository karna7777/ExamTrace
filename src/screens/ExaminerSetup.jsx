// First-run examiner setup screen. Shown once, when no examiner passcode has
// been configured yet. The passcode is sent to Main, which hashes it with
// scrypt and stores only the salt + hash.
import React, { useState } from "react";
import { api } from "../api.js";

export default function ExaminerSetup({ onComplete }) {
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (passcode.length < 6) {
      setError("Passcode must be at least 6 characters.");
      return;
    }
    if (passcode !== confirm) {
      setError("The two passcodes do not match.");
      return;
    }

    setBusy(true);
    try {
      await api.setupExaminer(passcode);
      onComplete();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered-screen">
      <div className="setup-card">
        <div className="brand brand-center">
          <span className="brand-mark">ET</span>
          <span className="brand-name dark">ExamTrace</span>
        </div>
        <h1>First-time setup</h1>
        <p className="muted">
          Create an examiner passcode. The examiner uses it to create and manage exams.
          It is stored securely as a salted hash - never in plain text.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="field-label">Examiner passcode</label>
          <input
            type="password"
            className="text-input"
            placeholder="At least 6 characters"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            autoFocus
          />

          <label className="field-label">Confirm passcode</label>
          <input
            type="password"
            className="text-input"
            placeholder="Re-enter passcode"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && <p className="status error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Setting up..." : "Create passcode & continue"}
          </button>
        </form>

        <p className="fine-print">
          After setup, ExamTrace opens in Candidate Mode and the built-in sample exam becomes
          available.
        </p>
      </div>
    </div>
  );
}

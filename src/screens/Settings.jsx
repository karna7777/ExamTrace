// Settings. In Examiner Mode the examiner can change their passcode (a Phase 2
// feature). Full theme and monitoring settings arrive in Phase 6; they are
// shown here as clearly-labelled placeholders so nothing looks fake.
import React, { useState } from "react";
import { api } from "../api.js";

export default function Settings({ isExaminer }) {
  return (
    <div>
      {isExaminer ? <ChangePasscode /> : null}

      <section className="panel">
        <h2>Display &amp; monitoring preferences</h2>
        <p className="muted">
          Theme selection and examiner monitoring preferences (inactivity threshold, demo mode)
          are added in Phase 6. This panel is a placeholder for now.
        </p>
      </section>
    </div>
  );
}

function ChangePasscode() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (next.length < 6) {
      setError("New passcode must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The new passcodes do not match.");
      return;
    }

    setBusy(true);
    try {
      await api.changeExaminerPasscode({ current, next });
      setMessage("Passcode changed successfully.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Change examiner passcode</h2>
      <form onSubmit={handleSubmit} className="narrow-form">
        <label className="field-label">Current passcode</label>
        <input
          type="password"
          className="text-input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <label className="field-label">New passcode</label>
        <input
          type="password"
          className="text-input"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <label className="field-label">Confirm new passcode</label>
        <input
          type="password"
          className="text-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <p className="status error">{error}</p>}
        {message && <p className="status success">{message}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving..." : "Change passcode"}
        </button>
      </form>
    </section>
  );
}

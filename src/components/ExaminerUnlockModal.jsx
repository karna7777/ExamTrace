// Prompts for the examiner passcode and asks Main to verify it. The passcode
// is only sent to Main; React never sees the stored hash or salt.
import React, { useState } from "react";
import Modal from "./Modal.jsx";
import { api } from "../api.js";

export default function ExaminerUnlockModal({ onUnlocked, onClose }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.unlockExaminer(passcode);
      if (result && result.ok) {
        onUnlocked();
      } else {
        setError("Incorrect passcode.");
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Unlock Examiner Mode" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="muted">Enter the examiner passcode to access exam management.</p>
        <input
          type="password"
          className="text-input"
          placeholder="Examiner passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoFocus
        />
        {error && <p className="status error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !passcode}>
            {busy ? "Checking..." : "Unlock"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

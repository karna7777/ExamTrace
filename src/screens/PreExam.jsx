// Shown before an examination starts. Collects the candidate's display name,
// shows the exam details and an honest monitoring disclosure, and requires
// explicit confirmation. The name is self-reported (NOT authenticated identity).
import React, { useState } from "react";
import { api } from "../api.js";
import CameraPreview from "../components/CameraPreview.jsx";

export default function PreExam({ exam, settings, onStarted, onCancel }) {
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleStart() {
    setError(null);
    if (!name.trim()) {
      setError("Please enter your name to begin.");
      return;
    }
    setBusy(true);
    try {
      await api.startExam(exam.id, name);
      onStarted();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered-screen">
      <div className="setup-card wide">
        <h1>{exam.title}</h1>
        {exam.subject && <p className="exam-subject">{exam.subject}</p>}

        <div className="exam-meta">
          <span>{exam.questionCount} questions</span>
          <span>•</span>
          <span>{exam.durationMinutes} minutes</span>
        </div>

        <div className="disclosure">
          <h3>Before you begin</h3>
          <ul>
            <li>The timer is {exam.durationMinutes} minutes and runs continuously once started.</li>
            <li>Switching away from this window, minimizing, exiting fullscreen and system inactivity will be recorded in an activity timeline.</li>
            <li>Monitoring records events for later review. It does not prove misconduct and does not pause the timer.</li>
            {settings && settings.cameraMonitoring && (
              <li>A camera preview will be shown during this exam. No video is recorded or uploaded.</li>
            )}
            <li>Your name is self-reported and saved with this attempt - it is not verified identity.</li>
          </ul>
        </div>

        {settings && settings.cameraMonitoring && (
          <div className="camera-consent">
            <p className="field-label">Camera check</p>
            <p className="muted" style={{ marginBottom: 10 }}>
              This exam uses camera monitoring. Please allow camera access when prompted. The preview
              below is live and is never recorded or uploaded.
            </p>
            <CameraPreview />
          </div>
        )}

        <label className="field-label">Your name *</label>
        <input
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your full name"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleStart()}
        />

        {error && <p className="status error">{error}</p>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleStart} disabled={busy}>
            {busy ? "Starting..." : "Start Examination"}
          </button>
        </div>
      </div>
    </div>
  );
}

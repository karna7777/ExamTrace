// Settings. Everyone can pick a theme. Examiner Mode adds exam/monitoring
// preferences and the passcode change. Main enforces which settings each mode
// may change (candidates can only change the theme).
import React, { useState } from "react";
import { api } from "../api.js";

export default function Settings({ isExaminer, settings, onSettingsChanged }) {
  if (!settings) return <p className="muted">Loading settings...</p>;

  return (
    <div>
      <ThemePanel settings={settings} onSettingsChanged={onSettingsChanged} />
      {isExaminer && <ExaminerSettingsPanel settings={settings} onSettingsChanged={onSettingsChanged} />}
      {isExaminer && <ChangePasscode />}
    </div>
  );
}

function ThemePanel({ settings, onSettingsChanged }) {
  const [error, setError] = useState(null);
  const options = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" }
  ];

  async function choose(theme) {
    setError(null);
    try {
      const updated = await api.saveSettings({ theme });
      onSettingsChanged(updated);
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  return (
    <section className="panel">
      <h2>Appearance</h2>
      <p className="muted">Choose how ExamTrace looks.</p>
      <div className="theme-choices">
        {options.map((o) => (
          <button
            key={o.value}
            className={"theme-choice" + (settings.theme === o.value ? " active" : "")}
            onClick={() => choose(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="status error">{error}</p>}
    </section>
  );
}

function ExaminerSettingsPanel({ settings, onSettingsChanged }) {
  const [duration, setDuration] = useState(settings.defaultDurationMinutes);
  const [fullscreen, setFullscreen] = useState(settings.fullscreenDuringExam);
  const [idle, setIdle] = useState(settings.inactivityThresholdSeconds);
  const [demo, setDemo] = useState(settings.demoMode);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const updated = await api.saveSettings({
        defaultDurationMinutes: Number(duration),
        fullscreenDuringExam: fullscreen,
        inactivityThresholdSeconds: Number(idle),
        demoMode: demo
      });
      onSettingsChanged(updated);
      setMessage("Settings saved.");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Exam &amp; monitoring preferences</h2>

      <label className="field-label">Default exam duration (minutes)</label>
      <input
        className="text-input"
        type="number"
        min="1"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
      />

      <label className="field-label">Inactivity threshold (seconds)</label>
      <input
        className="text-input"
        type="number"
        min="5"
        value={idle}
        onChange={(e) => setIdle(e.target.value)}
      />

      <label className="checkbox-row">
        <input type="checkbox" checked={fullscreen} onChange={(e) => setFullscreen(e.target.checked)} />
        <span>Enter fullscreen during examinations</span>
      </label>

      <label className="checkbox-row">
        <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
        <span>Demo Mode (10-second inactivity threshold for demonstrations)</span>
      </label>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

      <button className="btn btn-primary" onClick={save} disabled={busy}>
        {busy ? "Saving..." : "Save preferences"}
      </button>
    </section>
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
        <input type="password" className="text-input" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <label className="field-label">New passcode</label>
        <input type="password" className="text-input" value={next} onChange={(e) => setNext(e.target.value)} />
        <label className="field-label">Confirm new passcode</label>
        <input type="password" className="text-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p className="status error">{error}</p>}
        {message && <p className="status success">{message}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving..." : "Change passcode"}
        </button>
      </form>
    </section>
  );
}

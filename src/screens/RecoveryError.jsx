// Shown when the examiner auth file is missing but other app data exists.
// This is NOT a first run, so we must not let a new passcode be registered.
import React from "react";

export default function RecoveryError() {
  return (
    <div className="centered-screen">
      <div className="setup-card">
        <h1 className="danger-title">Authentication recovery needed</h1>
        <p className="muted">
          ExamTrace found existing application data, but the examiner authentication file is
          missing. For safety, a new passcode cannot be created automatically, because that
          could expose or overwrite existing exams and attempts.
        </p>
        <p className="muted">
          If this is a development machine and you want to start fresh, delete the ExamTrace
          data folder and relaunch the app:
        </p>
        <pre className="code-block">~/Library/Application Support/ExamTrace</pre>
        <p className="fine-print">
          This is local, application-level access control. It does not protect against someone
          who can directly modify local files.
        </p>
      </div>
    </div>
  );
}

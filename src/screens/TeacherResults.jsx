// Teacher Results (connected mode). Lists official student attempts collected by
// the server and opens a detailed report. Preview attempts are excluded by the
// server. Reuses ExamResult for the report view.
import React, { useEffect, useState } from "react";
import { api, formatClock } from "../api.js";
import ExamResult from "./ExamResult.jsx";

export default function TeacherResults() {
  const [rows, setRows] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.net.getResults();
    if (res.ok) {
      setRows(res.data || []);
      setError(null);
    } else {
      setRows([]);
      setError(res.error || "Could not load results.");
    }
  }

  async function openReport(attemptId) {
    const res = await api.net.getResultDetail(attemptId);
    if (res.ok) setReport(res.data);
    else setError(res.error || "Could not load the report.");
  }

  if (report) {
    return <ExamResult result={report} embedded backLabel="Back to Results" onDone={() => setReport(null)} />;
  }
  if (rows === null) return <p className="muted">Loading results...</p>;
  if (error) return <p className="status error">{error}</p>;
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">No student results yet</p>
        <p className="muted">Results appear here after students submit your published exams.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="muted" style={{ marginBottom: 14 }}>
        Official results collected by the server. Click a row for the full report.
      </p>
      <div className="history-list">
        {rows.map((r) => (
          <button key={r.attemptId} className="history-row" onClick={() => openReport(r.attemptId)}>
            <div className="history-main">
              <span className="history-title">{r.candidateName || "Unknown"}</span>
              <span className="history-sub">
                {(r.studentId || "—") + " • " + formatClock(r.endedAt)}
              </span>
            </div>
            <div className="history-stats">
              <span className="history-score">{r.percentage}%</span>
              <span className="history-detail">{r.score}/{r.totalQuestions}</span>
            </div>
            <div className="history-meta">
              <span>{r.submissionType === "auto" ? "Auto" : "Manual"}</span>
              <span>{r.monitoringEvents} events</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

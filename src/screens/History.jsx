// History / Reports screen. Lists finalized attempts (shared local history) and
// opens a full report for any attempt. Reports are built from the stored exam
// snapshot, so they stay correct even if the exam is later edited or deleted.
//
// Because there is no candidate authentication, this is history saved on THIS
// device - not a securely private per-student history.
import React, { useEffect, useState } from "react";
import { api, formatTime, formatClock } from "../api.js";
import ExamResult from "./ExamResult.jsx";

export default function History() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const list = await api.getExamHistory();
      setAttempts(list);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openReport(attemptId) {
    try {
      const r = await api.getExamReport(attemptId);
      setReport(r);
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  if (report) {
    return <ExamResult result={report} embedded backLabel="Back to History" onDone={() => setReport(null)} />;
  }

  if (loading) return <p className="muted">Loading history...</p>;
  if (error) return <p className="status error">{error}</p>;

  if (attempts.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">No attempts yet</p>
        <p className="muted">Completed examinations will appear here.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="muted" style={{ marginBottom: 14 }}>
        Attempts saved on this device. Click an attempt to open its full report.
      </p>
      <div className="history-list">
        {attempts.map((a) => (
          <button key={a.attemptId} className="history-row" onClick={() => openReport(a.attemptId)}>
            <div className="history-main">
              <span className="history-title">{a.title}</span>
              <span className="history-sub">
                {a.candidateName} • {formatClock(a.endedAt)}
              </span>
            </div>
            <div className="history-stats">
              <span className="history-score">{a.percentage}%</span>
              <span className="history-detail">{a.score}/{a.totalQuestions}</span>
            </div>
            <div className="history-meta">
              <span>{a.submissionType === "auto" ? "Auto" : "Manual"}</span>
              <span>{formatTime(a.timeUsedMs)}</span>
              <span>{a.monitoringEvents} events</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

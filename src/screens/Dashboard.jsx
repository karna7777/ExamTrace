// Dashboard. Candidate Mode shows available exams and a simple real summary.
// Examiner Mode shows real management stats plus the same exam cards with
// Edit/Delete. All numbers come from saved attempts (no fake stats).
import React, { useEffect, useState } from "react";
import ExamCard from "../components/ExamCard.jsx";
import { api } from "../api.js";

export default function Dashboard({ isExaminer, exams, onStart, onEdit, onDelete, onCreate }) {
  const hasExams = exams.length > 0;
  const [attempts, setAttempts] = useState([]);

  useEffect(() => {
    api
      .getExamHistory()
      .then(setAttempts)
      .catch(() => setAttempts([]));
  }, []);

  const total = attempts.length;
  const avg = total > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / total) : null;

  return (
    <div>
      <div className="stat-row">
        <StatCard label={isExaminer ? "Total exams" : "Exams available"} value={exams.length} />
        <StatCard label="Attempts" value={total} />
        <StatCard label="Average score" value={avg === null ? "—" : avg + "%"} hint={total === 0 ? "No attempts yet" : null} />
      </div>

      <div className="section-head">
        <h2>{isExaminer ? "Your exams" : "Available examinations"}</h2>
        {isExaminer && (
          <button className="btn btn-primary" onClick={onCreate}>
            + Create Exam
          </button>
        )}
      </div>

      {!hasExams ? (
        <div className="empty-state">
          <p className="empty-title">No examinations yet</p>
          <p className="muted">
            {isExaminer
              ? "Create your first exam to get started."
              : "No exams are available right now. Please check back later."}
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {exams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              isExaminer={isExaminer}
              onStart={onStart}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

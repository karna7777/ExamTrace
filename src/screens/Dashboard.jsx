// Dashboard. Candidate Mode shows available exams and a simple summary.
// Examiner Mode shows management stats plus the same exam cards with
// Edit/Delete controls. All numbers come from real data (no fake stats).
import React from "react";
import ExamCard from "../components/ExamCard.jsx";

export default function Dashboard({ isExaminer, exams, onEdit, onDelete, onCreate }) {
  const hasExams = exams.length > 0;

  return (
    <div>
      {isExaminer && (
        <div className="stat-row">
          <StatCard label="Total exams" value={exams.length} />
          <StatCard label="Total attempts" value={0} hint="Recorded in Phase 5" />
          <StatCard label="Average score" value="—" hint="No attempts yet" />
        </div>
      )}

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
              onStart={null /* exam engine arrives in Phase 3 */}
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
